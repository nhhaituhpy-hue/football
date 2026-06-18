/**
 * Cloudflare Worker for World Cup 2026 realtime flow.
 *
 * Required bindings/env:
 * - WC2026_CACHE: KV namespace binding for 30s cache.
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - SOFASCORE_LIVE_URL: SofaScore internal API URL to fetch live events.
 *
 * Routes:
 * - GET /live      -> SofaScore live data normalized and cached for 30s
 * - GET /matches   -> schedule from Supabase
 * - GET /standings -> group standings calculated from Supabase match scores
 */

const CACHE_TTL_SECONDS = 60;
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 OPR/107.0.0.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
];

const worker = {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshLiveCache(env, ctx));
  },

  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: JSON_HEADERS });

    const url = new URL(request.url);
    try {
      if (url.pathname === '/live') {
        const data = await getLive(env, ctx);
        return json(data);
      }

      if (url.pathname === '/matches') {
        const data = await getCached(env, 'matches', () =>
          getSupabaseRows(env, '/rest/v1/wc2026_matches?select=*&order=kickoff_utc.asc'),
        );
        return json(data);
      }

      if (url.pathname === '/standings') {
        const data = await getCached(env, 'standings', () => getStandings(env));
        return json(data);
      }

      return json({ error: 'Not found' }, 404);
    } catch (error) {
      return json({ error: error.message }, 500);
    }
  },
};

export default worker;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

async function getLive(env, ctx) {
  const cached = await env.WC2026_CACHE?.get('live', 'json');
  if (cached) return { ...cached, cached: true };

  const fresh = await refreshLiveCache(env, ctx);
  ctx?.waitUntil?.(Promise.resolve());
  return { ...fresh, cached: false };
}

async function getCached(env, key, loader) {
  const cached = await env.WC2026_CACHE?.get(key, 'json');
  if (cached) return { ...cached, cached: true };

  const envelope = {
    data: await loader(),
    cached: false,
    updated_at: new Date().toISOString(),
  };

  await env.WC2026_CACHE?.put(key, JSON.stringify(envelope), { expirationTtl: CACHE_TTL_SECONDS });
  return envelope;
}

async function refreshLiveCache(env, ctx) {
  try {
    const [dbMatches, dbTeams] = await Promise.all([
      getSupabaseRows(env, '/rest/v1/wc2026_matches?select=*'),
      getSupabaseRows(env, '/rest/v1/wc2026_teams?select=*')
    ]).catch(error => {
      console.warn('Failed to fetch data from Supabase:', error.message);
      return [[], []];
    });

    const now = new Date();
    const hasActiveOrUpcomingMatches = dbMatches.some(m => {
      if (m.status === 'live' || m.status === 'in_progress') return true;
      const kickoff = new Date(m.kickoff_utc);
      const diffMs = now.getTime() - kickoff.getTime();
      // Within 15 minutes before kickoff to 150 minutes after kickoff (approx 2.5 hours)
      return diffMs >= -15 * 60 * 1000 && diffMs <= 150 * 60 * 1000;
    });

    if (!hasActiveOrUpcomingMatches) {
      console.log('No active or upcoming matches in the schedule window. Skipping live scraper fetch.');
      const envelope = {
        data: [],
        cached: false,
        updated_at: now.toISOString(),
      };
      await env.WC2026_CACHE?.put('live', JSON.stringify(envelope), { expirationTtl: CACHE_TTL_SECONDS });
      return envelope;
    }

    const teamsById = new Map(dbTeams.map(t => [t.id, t]));
    const rawEvents = await fetchThethao247Live(env);

    // Fetch wc2026api matches lazily when needed
    let wc2026Matches = null;
    const getWc2026MatchesCached = async () => {
      if (wc2026Matches === null) {
        try {
          wc2026Matches = await fetchWc2026Matches(env);
        } catch (err) {
          console.warn('Failed to fetch matches from WC2026 API:', err.message);
          wc2026Matches = [];
        }
      }
      return wc2026Matches;
    };

    const dataPromises = rawEvents.map(async (event) => {
      const match = findMatchingMatch(dbMatches, teamsById, event);
      if (!match) return null;

      // If the match is already marked as finished in the database, skip scraping or updating it.
      if (match.status === 'finished') {
        return null;
      }

      let eventsList = [];
      if ((event.status === 'live' || event.status === 'finished') && event.detailUrl) {
        try {
          eventsList = await fetchMatchEventsDetail(event.detailUrl, match.id);
          // Persist match events to Supabase database so they are saved permanently
          ctx?.waitUntil?.(upsertMatchEventsToSupabase(env, match.id, eventsList));
        } catch (err) {
          console.warn(`Failed to fetch events detail for match ${match.id}:`, err.message);
        }
      }

      let homeScore = event.homeScore;
      let awayScore = event.awayScore;
      let homePen = null;
      let awayPen = null;
      let phase = event.isHt ? 'HT' : (event.status === 'live' ? 'Live' : event.status === 'finished' ? 'FT' : null);
      let status = event.status;

      if (event.status === 'finished') {
        // Retrieve the official score from the WC2026 API
        const wcMatchesList = await getWc2026MatchesCached();
        const apiMatch = wcMatchesList.find(m => Number(m.id) === Number(match.id));
        if (apiMatch) {
          homeScore = apiMatch.home_score ?? homeScore;
          awayScore = apiMatch.away_score ?? awayScore;
          homePen = apiMatch.home_pen ?? null;
          awayPen = apiMatch.away_pen ?? null;
          phase = apiMatch.phase || 'FT';
          status = 'finished';
          console.log(`Using official WC2026 API score for match ${match.id} (FT): ${homeScore} - ${awayScore}`);
        } else {
          console.warn(`Match ${match.id} is finished but not found in WC2026 API`);
        }
      }

      // Also persist match score, phase and status updates in the background
      if (status === 'live' || status === 'finished') {
        ctx?.waitUntil?.(updateMatchScoreInSupabase(env, match.id, homeScore, awayScore, status, phase, homePen, awayPen));
      }

      return {
        match_id: Number(match.id),
        provider_event_id: `${match.id}_thethao247`,
        status: status, // 'live', 'finished', 'scheduled'
        phase: phase,
        clock: null,
        minute: event.minute,
        home_score: homeScore,
        away_score: awayScore,
        home_pen: homePen,
        away_pen: awayPen,
        events: eventsList,
        updated_at: new Date().toISOString(),
      };
    });

    const data = (await Promise.all(dataPromises)).filter(Boolean);

    const envelope = {
      data,
      cached: false,
      updated_at: new Date().toISOString(),
    };

    await env.WC2026_CACHE?.put('live', JSON.stringify(envelope), { expirationTtl: CACHE_TTL_SECONDS });
    return envelope;
  } catch (error) {
    console.warn('Thethao247 refresh failed, falling back:', error.message);
    const cached = await env.WC2026_CACHE?.get('live', 'json');
    if (cached) return { ...cached, cached: true };

    const snapshots = await getSupabaseRows(env, '/rest/v1/wc2026_match_live_snapshots?select=*&order=updated_at.desc').catch(() => []);
    return {
      data: snapshots,
      cached: false,
      updated_at: new Date().toISOString(),
    };
  }
}

async function fetchMatchEventsDetail(url, matchId) {
  if (!url) return [];

  const randomUserAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  const response = await fetch(url, {
    headers: {
      'User-Agent': randomUserAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
  });

  if (!response.ok) {
    throw new Error(`Detail page returned HTTP ${response.status}`);
  }

  const html = await response.text();
  return parseEventsHtml(html, matchId);
}

function parseEventsHtml(html, matchId) {
  const events = [];
  const itemRegex = /<div class="summary-item d-flex px-2 fs-13 justify-content-between\s*(flex-row|flex-row-reverse)">([\s\S]*?)<div class="end-block">[\s\S]*?<\/div>\s*<\/div>/g;

  let match;
  let index = 0;
  while ((match = itemRegex.exec(html)) !== null) {
    const direction = match[1]; // 'flex-row' or 'flex-row-reverse'
    const blockContent = match[2];

    const isHomeTeam = direction !== 'flex-row-reverse';

    // Extract minute
    const centerMatch = blockContent.match(/<div class="center-block[^"]*">([\s\S]*?)<\/div>/);
    let minute = 0;
    if (centerMatch) {
      const minText = centerMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().replace("'", "");
      minute = parseInt(minText, 10) || 0;
    }

    // Extract event type
    const titleMatch = blockContent.match(/<title>([^<]*)<\/title>/);
    let eventTypeRaw = titleMatch ? titleMatch[1].toLowerCase().trim() : 'other';

    let eventType = 'other';
    if (eventTypeRaw.includes('goal')) {
      eventType = 'goal';
    } else if (eventTypeRaw.includes('yellow card') || eventTypeRaw.includes('thẻ vàng')) {
      eventType = 'card_yellow';
    } else if (eventTypeRaw.includes('red card') || eventTypeRaw.includes('thẻ đỏ')) {
      eventType = 'card_red';
    } else if (eventTypeRaw.includes('substitution') || eventTypeRaw.includes('thay người')) {
      eventType = 'substitution';
    } else if (eventTypeRaw.includes('var')) {
      eventType = 'var';
    }

    // Extract player name and detail
    const startBlockMatch = blockContent.match(/<div class="start-block[^"]*">([\s\S]*?)<\/div>\s*<\/div>/);
    let playerName = '';
    let detail = null;
    if (startBlockMatch) {
      const content = startBlockMatch[1];
      const strongMatch = content.match(/<strong>([\s\S]*?)<\/strong>/);
      const spanMatch = content.match(/<span[^>]*>([\s\S]*?)<\/span>/);

      playerName = strongMatch ? strongMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';
      const detailRaw = spanMatch ? spanMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';
      if (detailRaw) {
        detail = detailRaw;
      }
    }

    events.push({
      id: `scraped_event_${matchId}_${index++}`,
      match_id: Number(matchId),
      event_type: eventType,
      minute,
      player_name: playerName,
      detail,
      is_home_team: isHomeTeam
    });
  }
  return events;
}

async function upsertMatchEventsToSupabase(env, matchId, events) {
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
  } catch (err) {
    console.warn(`Error syncing events to Supabase for match ${matchId}:`, err.message);
  }
}

async function fetchWc2026Matches(env) {
  const baseUrl = env.WC2026_API_BASE_URL || 'https://api.wc2026api.com';
  const apiKey = env.WC2026_API_KEY;
  if (!apiKey) {
    throw new Error('Missing WC2026_API_KEY environment variable');
  }

  const response = await fetch(`${baseUrl}/matches`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`WC2026 API returned HTTP ${response.status}`);
  }

  return response.json();
}

async function updateMatchScoreInSupabase(env, matchId, homeScore, awayScore, status, phase, homePen = null, awayPen = null) {
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
  } catch (err) {
    console.warn(`Error updating match ${matchId} score in Supabase:`, err.message);
  }
}

async function fetchThethao247Live(env) {
  if (!env.THETHAO247_LIVE_URL) return [];

  const randomUserAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  const response = await fetch(env.THETHAO247_LIVE_URL, {
    headers: {
      'User-Agent': randomUserAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
  });

  if (!response.ok) {
    throw new Error(`Thethao247 returned HTTP ${response.status}`);
  }

  const html = await response.text();
  const blocks = html.match(/<li class="match-info box-event-one-style2[\s\S]*?<\/li>/g) || [];
  const matches = [];

  for (const block of blocks) {
    const homeMatch = block.match(/data-home-name="([^"]*)"/);
    const awayMatch = block.match(/data-away-name="([^"]*)"/);
    if (!homeMatch || !awayMatch) continue;

    const homeName = homeMatch[1].trim();
    const awayName = awayMatch[1].trim();

    // Extract scores
    const scoreBlockMatch = block.match(/<div class="score">([\s\S]*?)<\/div>/);
    let homeScore = null;
    let awayScore = null;
    if (scoreBlockMatch) {
      const scoreHtml = scoreBlockMatch[1];
      const spans = scoreHtml.match(/<span[^>]*>\s*([\d\?]+)\s*<\/span>/g);
      if (spans && spans.length >= 2) {
        const hMatch = spans[0].match(/>\s*([\d\?]+)\s*</);
        const aMatch = spans[1].match(/>\s*([\d\?]+)\s*</);
        if (hMatch && hMatch[1] !== '?') homeScore = Number(hMatch[1].trim());
        if (aMatch && aMatch[1] !== '?') awayScore = Number(aMatch[1].trim());
      }
    }

    // Extract status early
    const moreBlockMatch = block.match(/<div class="more">([\s\S]*?)<\/div>/);
    let statusText = '';
    if (moreBlockMatch) {
      statusText = moreBlockMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }

    const isLive = block.includes('is_live') || block.includes('blink_me') || statusText.toLowerCase().includes('live');
    const isFinished = statusText.toLowerCase() === 'ft' || statusText.toLowerCase() === 'hết giờ' || statusText.toLowerCase().includes('finished') || statusText.toLowerCase().includes('ended');

    // Extract time / minute
    const timeBlockMatch = block.match(/<div class="time">([\s\S]*?)<\/div>/);
    let timeText = '';
    let minute = null;
    let isHt = false;
    if (timeBlockMatch) {
      const timeHtml = timeBlockMatch[1];
      timeText = timeHtml.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      
      const matchMin = timeText.match(/(\d+)/);
      if (isLive) {
        if (matchMin) {
          minute = Number(matchMin[1]);
        }
        if (timeText.toUpperCase().includes('HT') || timeText.includes('giữa hiệp') || timeText.toLowerCase() === 'hết hiệp 1') {
          isHt = true;
        }
      }
    }

    const urlMatch = block.match(/onclick="window\.location\.href='([^']*)'/);
    const detailUrl = urlMatch ? urlMatch[1] : null;

    matches.push({
      homeName,
      awayName,
      homeScore,
      awayScore,
      status: isLive ? 'live' : isFinished ? 'finished' : 'scheduled',
      minute,
      isHt,
      detailUrl
    });
  }

  return matches;
}

function cleanName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove Vietnamese accents
    .replace(/[^a-z0-9]/g, '')       // Keep only alphanumeric characters
    .trim();
}

function teamMatches(team, scrapedName) {
  const cleanScraped = cleanName(scrapedName);
  const cleanVi = cleanName(team.name_vi);
  const cleanEn = cleanName(team.name_en);
  const cleanCode = cleanName(team.code);

  if (cleanScraped === cleanVi || cleanScraped === cleanEn || cleanScraped === cleanCode) {
    return true;
  }

  // Common synonym normalization helpers
  if (cleanScraped.includes('congo') && cleanVi.includes('congo')) return true;
  if (cleanScraped.includes('my') && cleanVi.includes('my')) return true;
  if (cleanScraped.includes('hoaky') && cleanVi.includes('my')) return true;
  if (cleanScraped.includes('uc') && cleanVi.includes('uc')) return true;
  if (cleanScraped.includes('arab') && cleanVi.includes('saudi')) return true;

  return false;
}

function findMatchingMatch(dbMatches, teamsById, scraped) {
  if (!dbMatches || !Array.isArray(dbMatches)) return null;

  return dbMatches.find(m => {
    const homeTeam = teamsById.get(m.home_team_id);
    const awayTeam = teamsById.get(m.away_team_id);
    if (!homeTeam || !awayTeam) return false;

    const homeMatch = teamMatches(homeTeam, scraped.homeName);
    const awayMatch = teamMatches(awayTeam, scraped.awayName);
    return homeMatch && awayMatch;
  });
}

async function getSupabaseRows(env, path) {
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  let supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseKey || supabaseKey.includes('your_')) {
    supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase Worker environment variables');
  }

  const response = await fetch(`${supabaseUrl}${path}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase returned HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function getStandings(env) {
  const [teams, matches] = await Promise.all([
    getSupabaseRows(env, '/rest/v1/wc2026_teams?select=*&order=group_name.asc'),
    getSupabaseRows(env, '/rest/v1/wc2026_matches?select=*&round_code=eq.group'),
  ]);

  const byGroup = {};
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
      Object.values(rows).sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf),
    ]),
  );
}
