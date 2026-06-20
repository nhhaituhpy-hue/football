import { getSupabaseRows } from '../repositories/supabase';
import { fetchWc2026Matches } from '../providers/wc2026api';
import { findMatchingMatch } from '../domain/match-normalizer';
import { dataHasChanged } from '../domain/change-detector';
import { scrapeAndSyncMatchEvents } from './event-sync';
import { runLoggingJob } from '../utils/logger';

function mapOddsApiStatus(apiStatus: string): string {
  if (apiStatus === 'settled') return 'finished';
  if (apiStatus === 'live') return 'live';
  return 'scheduled';
}

function mapClockStatusToPhase(apiStatus: string, clock: any): string | null {
  if (apiStatus === 'settled') return 'FT';
  if (!clock) return null;
  const detail = (clock.statusDetail || '').toLowerCase();
  if (detail.includes('1st') || detail.includes('first')) return '1H';
  if (detail.includes('2nd') || detail.includes('second')) return '2H';
  if (detail.includes('half time') || detail.includes('halftime') || (!clock.running && clock.period === 1)) return 'HT';
  if (detail.includes('overtime') || detail.includes('extra')) return 'ET';
  if (detail.includes('penalties') || detail.includes('penalty')) return 'PEN';
  return clock.statusDetail || null;
}

function liveStateHasChanged(oldData: any[] | null | undefined, newData: any[] | null | undefined): boolean {
  if (!oldData || !newData) return true;
  if (!Array.isArray(oldData) || !Array.isArray(newData)) return true;
  if (oldData.length !== newData.length) return true;
  for (let i = 0; i < oldData.length; i++) {
    const o = oldData[i];
    const n = newData[i];
    if (!o || !n) return true;
    if (o.match_id !== n.match_id) return true;
    if (o.status !== n.status) return true;
    if (o.phase !== n.phase) return true;
    if (o.home_score !== n.home_score) return true;
    if (o.away_score !== n.away_score) return true;
    if (o.home_pen !== n.home_pen) return true;
    if (o.away_pen !== n.away_pen) return true;
    const oRedHome = o.red_cards?.home ?? 0;
    const nRedHome = n.red_cards?.home ?? 0;
    const oRedAway = o.red_cards?.away ?? 0;
    const nRedAway = n.red_cards?.away ?? 0;
    if (oRedHome !== nRedHome || oRedAway !== nRedAway) return true;
  }
  return false;
}


export async function updateMatchScoreInSupabase(
  env: any,
  matchId: number,
  homeScore: number | null,
  awayScore: number | null,
  status: string,
  phase: string | null,
  homePen: number | null = null,
  awayPen: number | null = null
): Promise<void> {
  try {
    const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      console.warn(`Skipping score update for match ${matchId}: Supabase URL is not configured`);
      return;
    }

    const payload = {
      status: status,
      home_score: homeScore,
      away_score: awayScore,
      phase: phase,
      home_pen: homePen,
      away_pen: awayPen,
      updated_at: new Date().toISOString()
    };

    const response = await fetch(`${supabaseUrl}/rest/v1/wc2026_matches?id=eq.${matchId}`, {
      method: 'PATCH',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.warn(`Failed to update match ${matchId} score in Supabase: HTTP ${response.status}`);
    } else {
      console.log(`Successfully updated match ${matchId} score in Supabase`);
    }
  } catch (err: any) {
    console.warn(`Error updating match ${matchId} score in Supabase:`, err.message);
  }
}

export async function refreshLiveCacheAndSync(
  env: any,
  doInstance: { state: any; latestLiveMatches: any }
): Promise<{ hasActiveOrUpcoming: boolean; envelope: any }> {
  const doState = doInstance.state;
  try {
    const [dbMatches, dbTeams] = await Promise.all([
      getSupabaseRows(env, '/rest/v1/wc2026_matches?select=*'),
      getSupabaseRows(env, '/rest/v1/wc2026_teams?select=*')
    ]).catch(error => {
      console.warn('Failed to fetch data from Supabase:', error.message);
      return [[], []];
    });

    const now = new Date();
    const hasActiveOrUpcoming = dbMatches.some(m => {
      if (m.status === 'live' || m.status === 'in_progress') return true;
      if (m.status === 'finished' || m.status === 'cancelled' || m.status === 'postponed') return false;

      const kickoff = new Date(m.kickoff_utc);
      const diffMs = now.getTime() - kickoff.getTime();
      
      // If kickoff is in the past, or upcoming within the next 15 minutes
      return diffMs >= -15 * 60 * 1000;
    });

    if (!hasActiveOrUpcoming) {
      console.log('No active or upcoming matches in the schedule window. Resetting live matches cache.');
      const envelope = {
        data: [],
        cached: false,
        updated_at: now.toISOString(),
      };
      
      doInstance.latestLiveMatches = envelope;
      
      const cachedDO = await doState.storage.get('live');
      const oldData = cachedDO ? cachedDO.data : null;

      if (!oldData || oldData.length > 0) {
        console.log('Updating DO storage with empty live matches list...');
        await doState.storage.put('live', envelope);
      }
      return { hasActiveOrUpcoming: false, envelope };
    }

    const teamsById = new Map(dbTeams.map(t => [t.id, t]));

    // Fetch wc2026api matches lazily when needed
    let wc2026Matches: any[] | null = null;
    const getWc2026MatchesCached = async () => {
      if (wc2026Matches === null) {
        try {
          wc2026Matches = await fetchWc2026Matches(env);
        } catch (err: any) {
          console.warn('Failed to fetch matches from WC2026 API:', err.message);
          wc2026Matches = [];
        }
      }
      return wc2026Matches;
    };

    console.log(`Executing live Odds API sync step at ${new Date().toISOString()}...`);
    const apiKey = env.ODDS_API_KEY || '37eb8dbab6646bbf1f5c07f35e257f27a7dc694d9627b8bd761407f8a0575725';
    const eventsUrl = `https://api.odds-api.io/v3/events?sport=football&league=international-fifa-world-cup&apiKey=${apiKey}&limit=100`;

    const eventsRes = await fetch(eventsUrl).catch(err => {
      console.warn('Failed to fetch live events from Odds-API:', err.message);
      return null;
    });

    let rawEvents: any[] = [];
    if (eventsRes && eventsRes.ok) {
      const parsed = await eventsRes.json().catch(() => null);
      if (Array.isArray(parsed)) {
        rawEvents = parsed;
      }
    }

    const dataPromises = rawEvents.map(async (event) => {
      // Find database match using mapped team names
      const match = findMatchingMatch(dbMatches, teamsById, { homeName: event.home, awayName: event.away });
      if (!match) return null;

      if (match.status === 'finished') {
        return null;
      }

      let homeScore = event.scores ? Number(event.scores.home) : 0;
      let awayScore = event.scores ? Number(event.scores.away) : 0;
      let homePen = null;
      let awayPen = null;
      
      let status = mapOddsApiStatus(event.status);
      let calculatedPhase = mapClockStatusToPhase(event.status, event.clock);

      const wasNotFinishedInDb = match.status !== 'finished';
      const isNowFinished = status === 'finished';

      if (isNowFinished) {
        // Retrieve official score from WC2026 API
        const wcMatchesList = await getWc2026MatchesCached();
        const apiMatch = wcMatchesList.find(m => Number(m.id) === Number(match.id));
        if (apiMatch) {
          homeScore = apiMatch.home_score ?? homeScore;
          awayScore = apiMatch.away_score ?? awayScore;
          homePen = apiMatch.home_pen ?? null;
          awayPen = apiMatch.away_pen ?? null;
          calculatedPhase = (apiMatch.phase === 'FT' || apiMatch.phase === 'FT_PEN') ? apiMatch.phase : 'FT';
          status = 'finished';
          console.log(`Using official WC2026 API score for match ${match.id} (FT): ${homeScore} - ${awayScore}`);
        } else {
          console.warn(`Match ${match.id} is finished but not found in WC2026 API`);
        }

        // Update match status in the local DB matches array
        match.status = 'finished';

        // Sync detail events from thethao247 (post-match detail sync)
        if (wasNotFinishedInDb) {
          await scrapeAndSyncMatchEvents(env, null, match.id, match.home_team_name, match.away_team_name).catch(() => {});
        }
      }

      let calculatedMinute = event.clock?.minute || 0;
      if (status === 'finished') {
        calculatedMinute = (calculatedPhase === 'FT_PEN' || calculatedPhase === 'PEN' || calculatedPhase === 'ET') ? 120 : 90;
      }

      if (status === 'live' || status === 'finished') {
        await updateMatchScoreInSupabase(env, match.id, homeScore, awayScore, status, calculatedPhase, homePen, awayPen);
      }

      return {
        match_id: Number(match.id),
        provider_event_id: `${match.id}_odds_api`,
        status: status,
        phase: calculatedPhase,
        clock: null,
        minute: calculatedMinute,
        home_score: homeScore,
        away_score: awayScore,
        home_pen: homePen,
        away_pen: awayPen,
        red_cards: { home: 0, away: 0 },
        yellow_cards: { home: 0, away: 0 },
        events: [],
      };
    });

    const data = (await Promise.all(dataPromises)).filter(Boolean);

    const cachedDO = await doState.storage.get('live');
    const oldData = cachedDO ? cachedDO.data : null;

    const envelope = {
      data,
      cached: false,
      updated_at: new Date().toISOString(),
    };

    const hasActiveWs = doState.getWebSockets().length > 0;
    const hasChanged = dataHasChanged(oldData, data);

    if (hasChanged) {
      console.log('Live data has changed. Updating DO storage...');
      await doState.storage.put('live', envelope);
    } else {
      console.log('No changes detected. Skipping DO storage write.');
      if (cachedDO) {
        envelope.updated_at = cachedDO.updated_at;
      }
    }

    doInstance.latestLiveMatches = envelope;

    if (hasChanged && hasActiveWs) {
      const sockets = doState.getWebSockets();
      console.log(`Broadcasting matches update to ${sockets.length} WebSocket clients.`);
      const payloadString = JSON.stringify(envelope);
      for (const socket of sockets) {
        try {
          socket.send(payloadString);
        } catch (err: any) {
          console.warn("Failed to send message to socket:", err.message);
        }
      }
    }

    // Sparse logging for successful runs
    const hasStateChanged = liveStateHasChanged(oldData, data);
    const timeSinceLastLog = Date.now() - ((doInstance as any).lastLiveLogTime || 0);
    const shouldLog = hasStateChanged || timeSinceLastLog > 15 * 60 * 1000;

    if (shouldLog) {
      (doInstance as any).lastLiveLogTime = Date.now();
      try {
        await runLoggingJob(env, 'live-refresh', async () => {
          return {
            rowsRead: rawEvents.length,
            rowsWritten: data.length,
            message: `Live refresh status. State changed: ${hasStateChanged}. Matches active: ${data.length}`
          };
        });
      } catch (logErr: any) {
        console.error('Failed to log live refresh success status:', logErr.message);
      }
    }

    return { hasActiveOrUpcoming: true, envelope };
  } catch (error: any) {
    console.warn('Odds API refresh failed, falling back:', error.message);

    // Sparse logging for adapter errors
    const timeSinceLastErrorLog = Date.now() - ((doInstance as any).lastErrorLogTime || 0);
    const lastErrorMessage = (doInstance as any).lastErrorMessage;
    const isNewError = error.message !== lastErrorMessage;

    if (isNewError || timeSinceLastErrorLog > 5 * 60 * 1000) {
      (doInstance as any).lastErrorLogTime = Date.now();
      (doInstance as any).lastErrorMessage = error.message;
      try {
        await runLoggingJob(env, 'live-refresh-error', async () => {
          throw error;
        });
      } catch {
        // Error logged inside runLoggingJob
      }
    }

    const cached = await doState.storage.get('live');
    if (cached) {
      if (!doInstance.latestLiveMatches) {
        doInstance.latestLiveMatches = cached;
      }
      return { hasActiveOrUpcoming: true, envelope: { ...cached, cached: true } };
    }

    const snapshots = await getSupabaseRows(env, '/rest/v1/wc2026_match_live_snapshots?select=*&order=updated_at.desc').catch(() => []);
    const fallbackEnvelope = {
      data: snapshots,
      cached: false,
      updated_at: new Date().toISOString(),
    };
    if (!doInstance.latestLiveMatches) {
      doInstance.latestLiveMatches = fallbackEnvelope;
    }
    return {
      hasActiveOrUpcoming: true,
      envelope: fallbackEnvelope
    };
  }
}
