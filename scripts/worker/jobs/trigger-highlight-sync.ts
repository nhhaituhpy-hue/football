import { getSupabaseRows } from '../repositories/supabase';
import { runLoggingJob } from '../utils/logger';

export async function syncHighlightsTrigger(env: any): Promise<any> {
  const GITHUB_PAT = env.GITHUB_PAT;
  if (!GITHUB_PAT) {
    console.warn('Skipping highlights trigger: GITHUB_PAT is not configured in worker environment.');
    return { rowsRead: 0, rowsWritten: 0, message: 'Skipped: GITHUB_PAT is not configured.' };
  }

  const owner = env.GITHUB_REPO_OWNER || 'nhhaituhpy-hue';
  const repo = env.GITHUB_REPO_NAME || 'football';
  const workflowFile = env.GITHUB_WORKFLOW_FILE || 'sync_highlights.yml';

  // 1. Query matches missing highlights in Supabase first
  // This avoids creating empty logs in wc2026_api_sync_log every 5 minutes
  let matches;
  try {
    matches = await getSupabaseRows(
      env,
      '/rest/v1/wc2026_matches?select=id,home_team_name,away_team_name&phase=in.(FT,FT_PEN)&highlight_url=is.null'
    );
  } catch (err: any) {
    console.error('Failed to query matches missing highlights:', err.message);
    return { rowsRead: 0, rowsWritten: 0, error: err.message };
  }

  if (!matches || matches.length === 0) {
    return {
      rowsRead: 0,
      rowsWritten: 0,
      message: 'No finished matches lacking highlight URL. No trigger needed.'
    };
  }

  // 2. Only write a log row when a trigger action actually happens
  return runLoggingJob(env, 'highlights-trigger', async (correlationId) => {
    console.log(`[${correlationId}] Found ${matches.length} matches lacking highlights. Triggering GitHub Actions workflow...`);
    matches.forEach((m: any) => {
      console.log(`- Match ID ${m.id}: ${m.home_team_name} vs ${m.away_team_name}`);
    });

    // 2. Trigger workflow dispatch via GitHub API
    const dispatchUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`;
    const response = await fetch(dispatchUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${GITHUB_PAT}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Cloudflare-Worker'
      },
      body: JSON.stringify({
        ref: 'main'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API returned HTTP ${response.status}: ${errorText}`);
    }

    console.log(`[${correlationId}] Successfully triggered GitHub Actions highlights sync workflow`);

    return {
      rowsRead: matches.length,
      rowsWritten: 1,
      message: `Triggered GitHub Actions for ${matches.length} matches missing highlights.`
    };
  });
}
