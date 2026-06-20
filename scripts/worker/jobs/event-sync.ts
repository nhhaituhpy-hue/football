import { getSupabaseRows } from '../repositories/supabase';
import { fetchThethao247Live, fetchMatchEventsDetail } from '../providers/thethao247';
import { teamMatches } from '../domain/match-normalizer';

export async function upsertMatchEventsToSupabase(env: any, matchId: number, events: any[]): Promise<void> {
  try {
    const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      console.warn(`Skipping event upsert for match ${matchId}: Supabase URL is not configured`);
      return;
    }

    // 1. Delete all existing events for this match and provider to avoid stale/canceled events
    const deleteResponse = await fetch(`${supabaseUrl}/rest/v1/wc2026_match_events?match_id=eq.${matchId}&provider=eq.thethao247`, {
      method: 'DELETE',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      }
    });

    if (!deleteResponse.ok) {
      console.warn(`Failed to delete old events for match ${matchId}: HTTP ${deleteResponse.status} - ${await deleteResponse.text()}`);
    } else {
      console.log(`Successfully cleared old events for match ${matchId}`);
    }

    // 2. If there are fresh events, insert them
    if (events && events.length > 0) {
      const payload = events.map(event => ({
        match_id: matchId,
        provider: 'thethao247',
        provider_event_id: event.id,
        event_type: event.event_type,
        minute: event.minute,
        player_name: event.player_name,
        team_side: event.is_home_team ? 'home' : 'away',
        detail: event.detail || null,
        source_payload: event,
        created_at: new Date().toISOString()
      }));

      const insertResponse = await fetch(`${supabaseUrl}/rest/v1/wc2026_match_events`, {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!insertResponse.ok) {
        console.warn(`Failed to insert fresh events for match ${matchId}: HTTP ${insertResponse.status} - ${await insertResponse.text()}`);
      } else {
        console.log(`Successfully inserted ${events.length} fresh events to Supabase for match ${matchId}`);
      }
    }
  } catch (err: any) {
    console.warn(`Error syncing events to Supabase for match ${matchId}:`, err.message);
  }
}

export async function scrapeAndSyncMatchEvents(
  env: any,
  ctx: any,
  matchId: number,
  homeTeamName: string,
  awayTeamName: string
): Promise<void> {
  try {
    console.log(`Starting post-match event scraping from thethao247 for match ${matchId} (${homeTeamName} vs ${awayTeamName})...`);
    
    // Fetch all teams from database to resolve synonyms (English/Vietnamese names)
    const dbTeams = await getSupabaseRows(env, '/rest/v1/wc2026_teams?select=*').catch(() => []);
    
    // Find the teams involved in this match from the database
    const homeTeam = dbTeams.find(t => t.name_en === homeTeamName || t.name_vi === homeTeamName);
    const awayTeam = dbTeams.find(t => t.name_en === awayTeamName || t.name_vi === awayTeamName);
    
    if (!homeTeam || !awayTeam) {
      console.warn(`Could not resolve home/away team database entities for match ${matchId}: ${homeTeamName} vs ${awayTeamName}`);
      return;
    }

    const thethaoMatches = await fetchThethao247Live(env).catch(() => []);
    
    const match = thethaoMatches.find(m => {
      const homeMatch = teamMatches(homeTeam, m.homeName);
      const awayMatch = teamMatches(awayTeam, m.awayName);
      return homeMatch && awayMatch;
    });
    
    if (match && match.detailUrl) {
      console.log(`Found thethao247 detailUrl for match ${matchId}: ${match.detailUrl}`);
      const eventsList = await fetchMatchEventsDetail(match.detailUrl, matchId);
      
      if (eventsList.length > 0) {
        await upsertMatchEventsToSupabase(env, matchId, eventsList);
        console.log(`Successfully synced ${eventsList.length} events for match ${matchId} from thethao247`);
      } else {
        console.log(`No events parsed from detailUrl for match ${matchId}`);
      }
    } else {
      console.warn(`Could not find matching thethao247 match for ${homeTeamName} vs ${awayTeamName}`);
    }
  } catch (err: any) {
    console.warn(`Failed to sync events for match ${matchId} from thethao247:`, err.message);
  }
}
