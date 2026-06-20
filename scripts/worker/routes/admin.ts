import { requireAdmin } from '../auth/require-admin';
import { jsonCors } from '../utils';
import { getSupabaseRows } from '../repositories/supabase';
import { syncWc2026Schedule } from '../jobs/schedule-sync';
import { syncPredictionsToday } from '../jobs/prediction-sync';
import { scrapeAndSyncMatchEvents } from '../jobs/event-sync';
import { syncOddsFromHttp } from '../jobs/odds-sync';

export async function handleAdminRoutes(request: Request, env: any): Promise<Response | null> {
  const url = new URL(request.url);

  if (url.pathname === '/sync-schedule') {
    if (request.method !== 'POST') return jsonCors(request, { error: 'Method not allowed. Use POST.' }, 405);
    const adminResult = await requireAdmin(request, env);
    if (adminResult instanceof Response) return adminResult;
    await syncWc2026Schedule(env);
    return jsonCors(request, { status: 'success', message: 'Schedule and teams synced successfully' });
  }

  if (url.pathname === '/sync-odds') {
    if (request.method !== 'POST') return jsonCors(request, { error: 'Method not allowed. Use POST.' }, 405);
    const adminResult = await requireAdmin(request, env);
    if (adminResult instanceof Response) return adminResult;
    await syncOddsFromHttp(env);
    return jsonCors(request, { status: 'success', message: 'Odds synced successfully via HTTP Polling' });
  }

  if (url.pathname === '/sync-predictions') {
    if (request.method !== 'POST') return jsonCors(request, { error: 'Method not allowed. Use POST.' }, 405);
    const adminResult = await requireAdmin(request, env);
    if (adminResult instanceof Response) return adminResult;
    const result = await syncPredictionsToday(env);
    return jsonCors(request, result);
  }

  if (url.pathname === '/sync-events') {
    if (request.method !== 'POST') return jsonCors(request, { error: 'Method not allowed. Use POST.' }, 405);
    const adminResult = await requireAdmin(request, env);
    if (adminResult instanceof Response) return adminResult;
    const matchIdStr = url.searchParams.get('match_id');
    if (!matchIdStr) {
      return jsonCors(request, { error: 'Missing match_id parameter' }, 400);
    }
    const matchId = parseInt(matchIdStr, 10);
    if (isNaN(matchId)) {
      return jsonCors(request, { error: 'Invalid match_id' }, 400);
    }

    const dbMatches = await getSupabaseRows(env, `/rest/v1/wc2026_matches?id=eq.${matchId}`);
    if (!dbMatches || dbMatches.length === 0) {
      return jsonCors(request, { error: 'Match not found' }, 404);
    }
    const match = dbMatches[0];

    await scrapeAndSyncMatchEvents(env, null, match.id, match.home_team_name, match.away_team_name);
    
    const events = await getSupabaseRows(env, `/rest/v1/wc2026_match_events?match_id=eq.${matchId}&provider=eq.thethao247`);

    return jsonCors(request, { 
      status: 'success', 
      message: `Events sync completed for match ${matchId}`,
      events_count: events.length,
      events: events
    });
  }

  if (url.pathname === '/sync-events-today') {
    if (request.method !== 'POST') return jsonCors(request, { error: 'Method not allowed. Use POST.' }, 405);
    const adminResult = await requireAdmin(request, env);
    if (adminResult instanceof Response) return adminResult;
    const now = new Date();
    const localTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    const year = localTime.getUTCFullYear();
    const month = String(localTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(localTime.getUTCDate()).padStart(2, '0');
    const todayLocalDateStr = `${year}-${month}-${day}`;

    const startOfToday = `${todayLocalDateStr}T00:00:00+07:00`;
    const endOfToday = `${todayLocalDateStr}T23:59:59+07:00`;

    console.log(`Syncing all events today: ${startOfToday} -> ${endOfToday}`);
    const dbMatches = await getSupabaseRows(env, `/rest/v1/wc2026_matches?kickoff_utc=gte.${startOfToday}&kickoff_utc=lte.${endOfToday}`);
    
    if (!dbMatches || dbMatches.length === 0) {
      return jsonCors(request, { status: 'success', message: 'No matches scheduled for today', synced_matches: [] });
    }

    const results = [];
    for (const match of dbMatches) {
      if (match.status === 'finished' || match.status === 'live' || match.status === 'in_progress') {
        await scrapeAndSyncMatchEvents(env, null, match.id, match.home_team_name, match.away_team_name);
        results.push({
          id: match.id,
          home: match.home_team_name,
          away: match.away_team_name,
          status: match.status
        });
      }
    }

    return jsonCors(request, {
      status: 'success',
      message: `Synced events for ${results.length} matches today`,
      synced_matches: results
    });
  }

  if (url.pathname === '/trigger-highlights-workflow') {
    if (request.method !== 'POST') return jsonCors(request, { error: 'Method not allowed. Use POST.' }, 405);
    const adminResult = await requireAdmin(request, env);
    if (adminResult instanceof Response) return adminResult;
    const token = env.GITHUB_PAT;
    if (!token) {
      return jsonCors(request, { error: 'Missing GITHUB_PAT secret/environment variable in worker configuration' }, 500);
    }

    const githubUrl = 'https://api.github.com/repos/nhhaituhpy-hue/football/actions/workflows/sync_highlights.yml/dispatches';
    const response = await fetch(githubUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Cloudflare-Worker-Football',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({ ref: 'main' })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`GitHub API error: ${response.status} - ${errText}`);
      return jsonCors(request, { error: `GitHub API error: ${response.status} - ${errText}` }, 500);
    }

    return jsonCors(request, {
      status: 'success',
      message: 'GitHub Action highlight sync workflow triggered successfully'
    });
  }

  // Admin endpoint: update or delete highlight URL for a match
  if (url.pathname === '/admin/highlight') {
    if (request.method !== 'POST' && request.method !== 'DELETE') {
      return jsonCors(request, { error: 'Method not allowed. Use POST or DELETE.' }, 405);
    }
    const adminResult = await requireAdmin(request, env);
    if (adminResult instanceof Response) return adminResult;

    let body: any;
    try {
      body = await request.json();
    } catch {
      return jsonCors(request, { error: 'Invalid JSON body' }, 400);
    }

    const matchId = body.match_id;
    if (!matchId) {
      return jsonCors(request, { error: 'Missing match_id in body' }, 400);
    }

    const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return jsonCors(request, { error: 'Server misconfigured: missing Supabase credentials' }, 500);
    }

    const highlightUrl = request.method === 'DELETE' ? null : (body.highlight_url?.trim() || null);

    const patchRes = await fetch(`${supabaseUrl}/rest/v1/wc2026_matches?id=eq.${matchId}`, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ highlight_url: highlightUrl, updated_at: new Date().toISOString() }),
    });

    if (!patchRes.ok) {
      const errText = await patchRes.text();
      return jsonCors(request, { error: `Failed to update highlight: ${errText}` }, 500);
    }

    return jsonCors(request, {
      status: 'success',
      message: highlightUrl ? 'Highlight URL updated' : 'Highlight URL removed',
      match_id: matchId,
      highlight_url: highlightUrl,
    });
  }

  return null; // Not handled by admin routes
}
