import { getSupabaseRows, upsertSupabaseRows } from '../repositories/supabase';
import { teamMatches } from '../domain/match-normalizer';

export async function syncOddsFromHttp(env: any, forceAll = false): Promise<void> {
  const apiKey = env.ODDS_API_KEY || '37eb8dbab6646bbf1f5c07f35e257f27a7dc694d9627b8bd761407f8a0575725';
  const baseUrl = 'https://api.odds-api.io/v3';

  console.log('HTTP Odds Sync: Loading matches and teams from Supabase...');
  
  // 1. Fetch DB state
  const dbTeams = await getSupabaseRows(env, '/rest/v1/wc2026_teams?select=*').catch(() => []);
  const dbMatches = await getSupabaseRows(env, '/rest/v1/wc2026_matches?select=*').catch(() => []);

  if (dbTeams.length === 0 || dbMatches.length === 0) {
    console.warn('HTTP Odds Sync: Teams or matches database is empty. Skipping.');
    return;
  }

  const teamsById = new Map(dbTeams.map((t: any) => [t.id, t]));

  // Helper to find match
  function findMatchedMatch(homeName: string, awayName: string, dateStr: string): any | null {
    // 1. Match by teams
    let matched = dbMatches.find((m: any) => {
      const homeTeam = teamsById.get(m.home_team_id);
      const awayTeam = teamsById.get(m.away_team_id);
      if (!homeTeam || !awayTeam) return false;

      return teamMatches(homeTeam, homeName) && teamMatches(awayTeam, awayName);
    });

    // 2. Match by date closeness fallback
    if (!matched && dateStr) {
      const eventTime = new Date(dateStr).getTime();
      matched = dbMatches.find((m: any) => {
        const kickoffTime = new Date(m.kickoff_utc).getTime();
        const diffHrs = Math.abs(kickoffTime - eventTime) / (1000 * 60 * 60);
        if (diffHrs > 24) return false;

        const homeTeam = teamsById.get(m.home_team_id);
        const awayTeam = teamsById.get(m.away_team_id);
        if (!homeTeam || !awayTeam) return false;

        return teamMatches(homeTeam, homeName) || teamMatches(awayTeam, awayName);
      });
    }

    return matched || null;
  }

  // 2. Fetch all upcoming/active World Cup events from Odds-API.io
  const eventsUrl = `${baseUrl}/events?sport=football&league=international-fifa-world-cup&apiKey=${apiKey}&limit=100`;
  console.log(`HTTP Odds Sync: Fetching events from: ${eventsUrl}`);
  
  const eventsRes = await fetch(eventsUrl);
  if (!eventsRes.ok) {
    throw new Error(`Odds API events failed: HTTP ${eventsRes.status}`);
  }
  
  const events: any[] = await eventsRes.json();
  if (!Array.isArray(events)) {
    console.warn('HTTP Odds Sync: Unexpected events format', events);
    return;
  }

  console.log(`HTTP Odds Sync: Found ${events.length} events from Odds-API.`);

  // Filter out settled events, we only care about pending/live events
  let activeEvents = events.filter((e: any) => e.status === 'pending' || e.status === 'live');

  // BUDGET OPTIMIZATION: If not forceAll, only sync odds for live matches or matches starting in the next 24 hours
  if (!forceAll) {
    const nowMs = Date.now();
    activeEvents = activeEvents.filter((e: any) => {
      if (e.status === 'live') return true;
      const kickoffMs = new Date(e.date).getTime();
      return kickoffMs - nowMs < 24 * 60 * 60 * 1000;
    });
    console.log(`HTTP Odds Sync: Budget optimization enabled. Syncing ${activeEvents.length} events (live or starting in <24h).`);
  } else {
    console.log(`HTTP Odds Sync: Full sync requested. Syncing all ${activeEvents.length} active events.`);
  }

  if (activeEvents.length === 0) {
    return;
  }

  // Map events to database matches
  const mappedEvents: { eventId: number; matchId: number }[] = [];
  for (const e of activeEvents) {
    const matched = findMatchedMatch(e.home, e.away, e.date);
    if (matched) {
      mappedEvents.push({ eventId: e.id, matchId: Number(matched.id) });
    }
  }

  console.log(`HTTP Odds Sync: Successfully mapped ${mappedEvents.length} events.`);

  // 3. Fetch odds in batches of 10
  const batchSize = 10;
  for (let i = 0; i < mappedEvents.length; i += batchSize) {
    const batch = mappedEvents.slice(i, i + batchSize);
    const eventIds = batch.map(b => b.eventId).join(',');
    
    const oddsUrl = `${baseUrl}/odds/multi?eventIds=${eventIds}&bookmakers=Bet365&apiKey=${apiKey}`;
    console.log(`HTTP Odds Sync: Fetching odds batch ${i / batchSize + 1} from: ${oddsUrl}`);

    try {
      const oddsRes = await fetch(oddsUrl);
      if (!oddsRes.ok) {
        console.warn(`HTTP Odds Sync: Failed to fetch odds batch: HTTP ${oddsRes.status}`);
        continue;
      }
      
      const oddsData: any[] = await oddsRes.json();
      
      if (Array.isArray(oddsData)) {
        const upsertPayloads: any[] = [];
        
        for (const matchOddsObj of oddsData) {
          const targetEvent = batch.find(b => b.eventId === Number(matchOddsObj.id));
          if (targetEvent && matchOddsObj.bookmakers && matchOddsObj.bookmakers.Bet365) {
            const markets = matchOddsObj.bookmakers.Bet365;

            // Only sync allowed goal-related markets
            const ALLOWED_MARKETS = ['Spread', 'Totals', 'Asian Handicap', 'Goals Over/Under', 'Total Over/Under', 'Alternative Asian Handicap', 'Alternative Goal Line'];
            const goalMarkets = markets.filter((m: any) => ALLOWED_MARKETS.includes(m.name));

            if (goalMarkets.length > 0) {
              // Fetch existing odds first to merge markets
              const existingUrl = `/rest/v1/wc2026_match_odds?match_id=eq.${targetEvent.matchId}&select=*`;
              const existingRows = await getSupabaseRows(env, existingUrl).catch(() => []);
              const existingMarkets = existingRows.length > 0 ? existingRows[0].odds_data : [];

              // Merge allowed markets
              const marketMap = new Map(
                existingMarkets
                  .filter((m: any) => ALLOWED_MARKETS.includes(m.name))
                  .map((m: any) => [m.name, m])
              );
              goalMarkets.forEach((m: any) => {
                marketMap.set(m.name, m);
              });
              const mergedMarkets = Array.from(marketMap.values());

              upsertPayloads.push({
                match_id: targetEvent.matchId,
                bookmaker: 'Bet365',
                odds_data: mergedMarkets,
                updated_at: new Date().toISOString()
              });
            }
          }
        }

        if (upsertPayloads.length > 0) {
          await upsertSupabaseRows(env, '/rest/v1/wc2026_match_odds', upsertPayloads);
          console.log(`HTTP Odds Sync: Upserted ${upsertPayloads.length} matches odds to Supabase.`);
        }
      }
    } catch (batchErr: any) {
      console.error(`HTTP Odds Sync: Error in batch ${i / batchSize + 1}:`, batchErr.message);
    }
  }
}
