import { upsertSupabaseRows } from '../repositories/supabase';
import { mapApiTeam, mapApiMatch } from '../domain/match-normalizer';
import { runLoggingJob } from '../utils/logger';

export async function syncWc2026Schedule(env: any): Promise<void> {
  console.log('Starting scheduled schedule sync from wc2026api...');
  
  await runLoggingJob(env, 'schedule-sync', async (correlationId) => {
    const baseUrl = env.WC2026_API_BASE_URL || 'https://api.wc2026api.com';
    const apiKey = env.WC2026_API_KEY;
    if (!apiKey) {
      throw new Error('Missing WC2026_API_KEY in worker environment');
    }

    // Fetch teams and matches in parallel
    const [teamsRes, matchesRes] = await Promise.all([
      fetch(`${baseUrl}/teams`, { headers: { Authorization: `Bearer ${apiKey}` } }),
      fetch(`${baseUrl}/matches`, { headers: { Authorization: `Bearer ${apiKey}` } })
    ]);

    if (!teamsRes.ok || !matchesRes.ok) {
      throw new Error(`Failed to fetch from WC2026 API. Teams status: ${teamsRes.status}, Matches status: ${matchesRes.status}`);
    }

    const rawTeams = await teamsRes.json() as any[];
    const rawMatches = await matchesRes.json() as any[];

    console.log(`[${correlationId}] Fetched ${rawTeams.length} teams and ${rawMatches.length} matches from API`);

    const mappedTeams = rawTeams.map(mapApiTeam);
    const mappedMatches = rawMatches.map(mapApiMatch);

    // Upsert teams and matches
    await upsertSupabaseRows(env, '/rest/v1/wc2026_teams', mappedTeams);
    await upsertSupabaseRows(env, '/rest/v1/wc2026_matches', mappedMatches);

    console.log(`[${correlationId}] Successfully completed schedule sync from wc2026api`);

    return {
      rowsRead: rawTeams.length + rawMatches.length,
      rowsWritten: mappedTeams.length + mappedMatches.length,
      message: `Successfully synced ${mappedTeams.length} teams and ${mappedMatches.length} matches.`,
    };
  });
}
