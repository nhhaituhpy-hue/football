import { getSupabaseRows } from '../repositories/supabase';
import { JSON_HEADERS } from '../config';

export async function getStandings(env: any): Promise<Record<string, any[]>> {
  const [teams, matches] = await Promise.all([
    getSupabaseRows(env, '/rest/v1/wc2026_teams?select=*&order=group_name.asc'),
    getSupabaseRows(env, '/rest/v1/wc2026_matches?select=*&round_code=eq.group'),
  ]);

  const byGroup: Record<string, Record<number, any>> = {};
  for (const team of teams) {
    if (!team.group_name) continue;
    byGroup[team.group_name] ||= {};
    byGroup[team.group_name][team.id] = {
      team,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0,
    };
  }

  for (const match of matches) {
    if (match.status === 'scheduled' || match.home_score == null || match.away_score == null) continue;
    const home = byGroup[match.group_name]?.[match.home_team_id];
    const away = byGroup[match.group_name]?.[match.away_team_id];
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;
    home.gf += match.home_score;
    home.ga += match.away_score;
    away.gf += match.away_score;
    away.ga += match.home_score;

    if (match.home_score > match.away_score) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
    } else if (match.home_score < match.away_score) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }

    home.gd = home.gf - home.ga;
    away.gd = away.gf - away.ga;
  }

  return Object.fromEntries(
    Object.entries(byGroup).map(([group, rows]) => [
      group,
      Object.values(rows).sort((a: any, b: any) => b.points - a.points || b.gd - a.gd || b.gf - a.gf),
    ]),
  );
}

export async function handlePublicRoutes(request: Request, env: any, ctx: any): Promise<Response | null> {
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === 'true';

  if (url.pathname === '/live') {
    const id = env.LIVE_CACHE_DO.idFromName("global_live_cache");
    const obj = env.LIVE_CACHE_DO.get(id);
    
    if (force) {
      // Trigger immediate scrape and fetch from DO
      return obj.fetch(request);
    } else {
      // Asynchronously ensure the DO alarm is running if active matches exist
      ctx.waitUntil(obj.fetch("http://do/start-alarm"));
      return obj.fetch(request);
    }
  }

  let payload: any;
  let cacheTtl = 300; // Default cache TTL in seconds

  if (url.pathname === '/matches') {
    const data = await getSupabaseRows(env, '/rest/v1/wc2026_matches?select=*&order=kickoff_utc.asc');
    payload = {
      data,
      cached: false,
      updated_at: new Date().toISOString(),
    };
    cacheTtl = 300;
  } else if (url.pathname === '/standings') {
    const data = await getStandings(env);
    payload = {
      data,
      cached: false,
      updated_at: new Date().toISOString(),
    };
    cacheTtl = 300;
  } else {
    return null; // Not handled by public routes
  }

  // Create the response and add Cache-Control headers
  const responseHeaders = {
    ...JSON_HEADERS,
    'Cache-Control': `public, max-age=${cacheTtl}, s-maxage=${cacheTtl}`,
  };
  
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: responseHeaders,
  });
}
