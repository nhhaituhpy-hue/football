import * as cheerio from 'cheerio';

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

export class LiveCacheObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.latestLiveMatches = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    
    if (url.pathname === '/live') {
      // Check if client is requesting a WebSocket upgrade
      if (request.headers.get("Upgrade") === "websocket") {
        console.log("WebSocket connection request received.");
        const webSocketPair = new WebSocketPair();
        const [client, server] = Object.values(webSocketPair);

        // Accept the server WebSocket under DO Hibernation
        this.state.acceptWebSocket(server);

        // Send the current cached data to the socket immediately if available
        try {
          const cached = this.latestLiveMatches || await this.state.storage.get("live");
          if (cached) {
            server.send(JSON.stringify(cached));
          } else {
            server.send(JSON.stringify({ data: [], updated_at: new Date().toISOString() }));
          }
        } catch (err) {
          console.warn("Failed to send initial cached matches to socket:", err.message);
        }

        // Asynchronously check if the alarm needs to be started
        const currentAlarm = await this.state.storage.getAlarm();
        if (currentAlarm === null) {
          const dbMatches = await getSupabaseRows(this.env, '/rest/v1/wc2026_matches?select=*').catch(() => []);
          const now = new Date();
          const hasActiveOrUpcoming = dbMatches.some(m => {
            if (m.status === 'live' || m.status === 'in_progress') return true;
            if (m.status === 'finished' || m.status === 'cancelled' || m.status === 'postponed') return false;

            const kickoff = new Date(m.kickoff_utc);
            const diffMs = now.getTime() - kickoff.getTime();
            return diffMs >= -15 * 60 * 1000;
          });

          if (hasActiveOrUpcoming) {
            console.log('Active or upcoming matches found on WS connection. Starting DO alarm...');
            await this.state.storage.setAlarm(Date.now() + 100);
          }
        }

        // Return status 101 Switching Protocols
        return new Response(null, {
          status: 101,
          webSocket: client,
        });
      }

      // Standard HTTP fetch (Fallback/Force)
      const force = url.searchParams.get('force') === 'true';

      // Nếu DO vừa thức dậy từ hibernate (in-memory cache trống),
      // scrape tươi 1 lần để lấy phút mới nhất trước khi trả kết quả
      if (force || !this.latestLiveMatches) {
        console.log(force ? "Force refresh requested." : "DO woke from hibernation, scraping fresh data...");
        try {
          await refreshLiveCacheAndSync(this.env, this);
        } catch (err) {
          console.warn("Scrape on fetch failed:", err.message);
        }
      }
      
      const payload = this.latestLiveMatches || await this.state.storage.get("live") || {
        data: [],
        cached: false,
        updated_at: new Date().toISOString(),
      };
      
      return new Response(JSON.stringify(payload), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    if (url.pathname === '/start-alarm') {
      const currentAlarm = await this.state.storage.getAlarm();
      if (currentAlarm === null) {
        // Fetch matches from Supabase to check if any are live or starting soon
        const dbMatches = await getSupabaseRows(this.env, '/rest/v1/wc2026_matches?select=*').catch(() => []);
        const now = new Date();
        const hasActiveOrUpcoming = dbMatches.some(m => {
          if (m.status === 'live' || m.status === 'in_progress') return true;
          if (m.status === 'finished' || m.status === 'cancelled' || m.status === 'postponed') return false;

          const kickoff = new Date(m.kickoff_utc);
          const diffMs = now.getTime() - kickoff.getTime();
          
          // Kickoff in past, or starting in the next 15 mins
          return diffMs >= -15 * 60 * 1000;
        });

        if (hasActiveOrUpcoming) {
          console.log('Active or upcoming matches found. Starting DO alarm...');
          await this.state.storage.setAlarm(Date.now() + 100); // Trigger in 100ms
          return new Response(JSON.stringify({ status: "started" }), { headers: JSON_HEADERS });
        } else {
          console.log('No active/upcoming matches. Alarm NOT started.');
          return new Response(JSON.stringify({ status: "skipped", reason: "no_active_matches" }), { headers: JSON_HEADERS });
        }
      }
      return new Response(JSON.stringify({ status: "already_running" }), { headers: JSON_HEADERS });
    }

    return new Response("Not Found", { status: 404 });
  }

  async alarm() {
    console.log("Durable Object alarm triggered. Running scrape step...");
    try {
      const result = await refreshLiveCacheAndSync(this.env, this);
      if (result.hasActiveOrUpcoming) {
        console.log("Active or upcoming matches remain. Scheduling next alarm in 15s...");
        await this.state.storage.setAlarm(Date.now() + 15000);
      } else {
        console.log("No active or upcoming matches. Alarm loop stopping.");
      }
    } catch (err) {
      console.error("Durable Object alarm execution failed:", err.message);
      // Try again in 30s in case of transient errors
      await this.state.storage.setAlarm(Date.now() + 30000);
    }
  }

  // WebSocket Hibernation Events
  webSocketMessage(ws, message) {
    // We do not expect client messages; ignore
    console.log("WebSocket message received from client (ignored):", message);
  }

  webSocketClose(ws, code, reason, wasClean) {
    console.log(`WebSocket closed. Code: ${code}, Reason: ${reason}, WasClean: ${wasClean}`);
    ws.close();
  }

  webSocketError(ws, error) {
    console.error("WebSocket error:", error);
    ws.close();
  }
}

const worker = {
  async scheduled(event, env, ctx) {
    if (event.cron === "0 1 * * *") {
      ctx.waitUntil(syncPredictionsToday(env));
    } else if (event.cron === "0 */6 * * *") {
      ctx.waitUntil(syncWc2026Schedule(env));
    } else {
      const id = env.LIVE_CACHE_DO.idFromName("global_live_cache");
      const obj = env.LIVE_CACHE_DO.get(id);
      ctx.waitUntil(obj.fetch("http://do/start-alarm"));
    }
  },

  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: JSON_HEADERS });

    const url = new URL(request.url);
    const isCacheablePath = ['/live', '/matches', '/standings'].includes(url.pathname);
    const force = url.searchParams.get('force') === 'true';

    // Try to fetch from Cloudflare Cache API (exclude /live from CDN cache as DO is fast and we want live updates)
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);
    if (isCacheablePath && url.pathname !== '/live' && request.method === 'GET' && !force) {
      try {
        const cachedResponse = await cache.match(cacheKey);
        if (cachedResponse) {
          return cachedResponse;
        }
      } catch (cacheError) {
        console.warn('Cache match failed:', cacheError.message);
      }
    }

    try {
      if (url.pathname === '/sync-schedule') {
        await syncWc2026Schedule(env);
        return json({ status: 'success', message: 'Schedule and teams synced successfully' });
      }

      if (url.pathname === '/sync-predictions') {
        const result = await syncPredictionsToday(env);
        return json(result);
      }

      if (url.pathname === '/sync-events') {
        const matchIdStr = url.searchParams.get('match_id');
        if (!matchIdStr) {
          return json({ error: 'Missing match_id parameter' }, 400);
        }
        const matchId = parseInt(matchIdStr, 10);
        if (isNaN(matchId)) {
          return json({ error: 'Invalid match_id' }, 400);
        }

        const dbMatches = await getSupabaseRows(env, `/rest/v1/wc2026_matches?id=eq.${matchId}`);
        if (!dbMatches || dbMatches.length === 0) {
          return json({ error: 'Match not found' }, 404);
        }
        const match = dbMatches[0];

        await scrapeAndSyncMatchEvents(env, null, match.id, match.home_team_name, match.away_team_name);
        
        const events = await getSupabaseRows(env, `/rest/v1/wc2026_match_events?match_id=eq.${matchId}&provider=eq.thethao247`);

        return json({ 
          status: 'success', 
          message: `Events sync completed for match ${matchId}`,
          events_count: events.length,
          events: events
        });
      }

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

      let payload;
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
        return json({ error: 'Not found' }, 404);
      }

      // Create the response and add Cache-Control headers
      const responseHeaders = {
        ...JSON_HEADERS,
        'Cache-Control': `public, max-age=${cacheTtl}, s-maxage=${cacheTtl}`,
      };
      const response = new Response(JSON.stringify(payload), {
        status: 200,
        headers: responseHeaders,
      });

      // Store the response in Cache API
      if (isCacheablePath && request.method === 'GET') {
        try {
          ctx.waitUntil(cache.put(cacheKey, response.clone()));
        } catch (cachePutError) {
          console.warn('Cache put failed:', cachePutError.message);
        }
      }

      return response;
    } catch (error) {
      return json({ error: error.message }, 500);
    }
  },
};

export default worker;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

async function refreshLiveCacheAndSync(env, doInstance) {
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

    console.log(`Executing live scrape step at ${new Date().toISOString()}...`);
    const rawEvents = await fetchBongdaluLive(env).catch(err => {
      console.warn('Failed to fetch Bongdalu live matches:', err.message);
      return [];
    });

    // Tải thời điểm chuyển giai đoạn (bắt đầu hiệp 2, hiệp phụ) từ DO storage
    const periodTransitions = await doState.storage.get('periodTransitions') || {};
    let transitionsUpdated = false;

    const dataPromises = rawEvents.map(async (event) => {
      const match = findMatchingMatch(dbMatches, teamsById, event);
      if (!match) return null;

      if (match.status === 'finished') {
        return null;
      }

      let homeScore = event.homeScore;
      let awayScore = event.awayScore;
      let homePen = null;
      let awayPen = null;
      let phase = event.phase;
      let status = event.status;

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
          phase = (apiMatch.phase === 'FT' || apiMatch.phase === 'FT_PEN') ? apiMatch.phase : 'FT';
          status = 'finished';
          console.log(`Using official WC2026 API score for match ${match.id} (FT): ${homeScore} - ${awayScore}`);
        } else {
          console.warn(`Match ${match.id} is finished but not found in WC2026 API`);
        }

        // Update match status in the local DB matches array
        match.status = 'finished';

        // Sync detail events from thethao247
        if (wasNotFinishedInDb) {
          await scrapeAndSyncMatchEvents(env, null, match.id, match.home_team_name, match.away_team_name);
        }
      }

      // === TÍNH PHÚT THI ĐẤU TỪ KICKOFF_UTC (DB) ===
      let calculatedMinute = event.minute; // fallback (HT=45, FT=90)
      let calculatedPhase = phase;

      if (status === 'live' && match.kickoff_utc) {
        const kickoff = new Date(match.kickoff_utc);
        const now = new Date();
        const elapsedFromKickoff = Math.ceil((now.getTime() - kickoff.getTime()) / 60000);
        const matchIdStr = String(match.id);

        if (phase === '1H') {
          // Hiệp 1: đếm từ kickoff, tối đa 45 phút
          if (elapsedFromKickoff <= 45) {
            calculatedMinute = Math.max(1, elapsedFromKickoff);
          } else {
            // Quá 45' mà Bongdalu vẫn báo hiệp 1 → bù giờ
            calculatedMinute = 45;
            calculatedPhase = '1H+';
          }
        } else if (phase === 'HT') {
          calculatedMinute = 45;
        } else if (phase === '2H') {
          // Hiệp 2: đếm từ thời điểm bắt đầu hiệp 2
          if (!periodTransitions[matchIdStr]?.secondHalfStartedAt) {
            // Lần đầu phát hiện hiệp 2 → dùng match[7] từ Bongdalu (chính xác hơn 'now')
            // match[7] được Bongdalu cập nhật thành thời điểm bắt đầu hiệp 2
            const bongdaluStart = event.bongdaluPeriodStart ? parseUtcDate(event.bongdaluPeriodStart) : null;
            const secondHalfStart = bongdaluStart && bongdaluStart < now ? bongdaluStart : now;
            periodTransitions[matchIdStr] = periodTransitions[matchIdStr] || {};
            periodTransitions[matchIdStr].secondHalfStartedAt = secondHalfStart.toISOString();
            transitionsUpdated = true;
            const shElapsed = Math.ceil((now.getTime() - secondHalfStart.getTime()) / 60000);
            calculatedMinute = Math.max(46, 46 + shElapsed);
          } else {
            // Kiểm tra và tự sửa nếu thời điểm lưu sai (ví dụ: deploy giữa trận)
            const bongdaluStart = event.bongdaluPeriodStart ? parseUtcDate(event.bongdaluPeriodStart) : null;
            const shStart = new Date(periodTransitions[matchIdStr].secondHalfStartedAt);
            // Nếu Bongdalu cung cấp thời điểm bắt đầu hiệp 2 khác >2 phút so với lưu trữ → sửa lại
            if (bongdaluStart && Math.abs(shStart.getTime() - bongdaluStart.getTime()) > 120000) {
              periodTransitions[matchIdStr].secondHalfStartedAt = bongdaluStart.toISOString();
              transitionsUpdated = true;
              const shElapsed = Math.ceil((now.getTime() - bongdaluStart.getTime()) / 60000);
              if (46 + shElapsed <= 90) {
                calculatedMinute = 46 + shElapsed;
              } else {
                calculatedMinute = 90;
                calculatedPhase = '2H+';
              }
            } else {
              const shElapsed = Math.ceil((now.getTime() - shStart.getTime()) / 60000);
              if (46 + shElapsed <= 90) {
                calculatedMinute = 46 + shElapsed;
              } else {
                // Quá 90' mà Bongdalu vẫn báo hiệp 2 → bù giờ
                calculatedMinute = 90;
                calculatedPhase = '2H+';
              }
            }
          }
        } else if (phase === 'ET') {
          // Hiệp phụ: đếm từ thời điểm bắt đầu hiệp phụ
          if (!periodTransitions[matchIdStr]?.extraTimeStartedAt) {
            const bongdaluStart = event.bongdaluPeriodStart ? parseUtcDate(event.bongdaluPeriodStart) : null;
            const extraTimeStart = bongdaluStart && bongdaluStart < now ? bongdaluStart : now;
            periodTransitions[matchIdStr] = periodTransitions[matchIdStr] || {};
            periodTransitions[matchIdStr].extraTimeStartedAt = extraTimeStart.toISOString();
            transitionsUpdated = true;
            const etElapsed = Math.ceil((now.getTime() - extraTimeStart.getTime()) / 60000);
            calculatedMinute = Math.max(91, 91 + etElapsed);
          } else {
            const etStart = new Date(periodTransitions[matchIdStr].extraTimeStartedAt);
            const etElapsed = Math.ceil((now.getTime() - etStart.getTime()) / 60000);
            calculatedMinute = Math.max(91, 91 + etElapsed);
          }
        } else if (phase === 'PEN') {
          // Loạt penalty: không cần tính phút, giữ nguyên phase PEN
          calculatedMinute = 120;
        }
      }

      if (status === 'live' || status === 'finished') {
        await updateMatchScoreInSupabase(env, match.id, homeScore, awayScore, status, calculatedPhase, homePen, awayPen);
      }

      return {
        match_id: Number(match.id),
        provider_event_id: `${match.id}_bongdalu`,
        status: status,
        phase: calculatedPhase,
        clock: null,
        minute: calculatedMinute,
        home_score: homeScore,
        away_score: awayScore,
        home_pen: homePen,
        away_pen: awayPen,
        red_cards: event.redCards || { home: 0, away: 0 },
        yellow_cards: event.yellowCards || { home: 0, away: 0 },
        events: [],
      };
    });

    const data = (await Promise.all(dataPromises)).filter(Boolean);

    // Dọn dẹp transitions của trận đã kết thúc và lưu nếu có thay đổi
    const liveMatchIds = new Set(data.map(d => String(d.match_id)));
    for (const key of Object.keys(periodTransitions)) {
      if (!liveMatchIds.has(key)) {
        delete periodTransitions[key];
        transitionsUpdated = true;
      }
    }
    if (transitionsUpdated) {
      await doState.storage.put('periodTransitions', periodTransitions);
    }

    const cachedDO = await doState.storage.get('live');
    const oldData = cachedDO ? cachedDO.data : null;

    const envelope = {
      data,
      cached: false,
      updated_at: new Date().toISOString(),
    };

    const hasActiveWs = doState.getWebSockets().length > 0;
    const hasChanged = dataHasChanged(oldData, data);

    // Ghi SQLite mỗi khi có bất kỳ thay đổi nào (bao gồm phút thi đấu)
    // để thiết bị mới kết nối luôn nhận được dữ liệu mới nhất từ persistent storage
    if (hasChanged) {
      console.log('Live data has changed. Updating DO storage...');
      await doState.storage.put('live', envelope);
    } else {
      console.log('No changes detected. Skipping DO storage write.');
      if (cachedDO) {
        envelope.updated_at = cachedDO.updated_at;
      }
    }

    // Luôn cập nhật bộ nhớ in-memory của DO với phút mới nhất
    doInstance.latestLiveMatches = envelope;

    if (hasChanged && hasActiveWs) {
      const sockets = doState.getWebSockets();
      console.log(`Broadcasting matches update to ${sockets.length} WebSocket clients.`);
      const payloadString = JSON.stringify(envelope);
      for (const socket of sockets) {
        try {
          socket.send(payloadString);
        } catch (err) {
          console.warn("Failed to send message to socket:", err.message);
        }
      }
    }

    return { hasActiveOrUpcoming: true, envelope };
  } catch (error) {
    console.warn('Bongdalu refresh failed, falling back:', error.message);
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

    // Skip player substitutions entirely
    if (eventTypeRaw.includes('substitution') || eventTypeRaw.includes('thay người')) {
      continue;
    }

    let eventType = 'other';
    if (eventTypeRaw.includes('goal')) {
      eventType = 'goal';
    } else if (eventTypeRaw.includes('yellow card') || eventTypeRaw.includes('thẻ vàng')) {
      eventType = 'card_yellow';
    } else if (eventTypeRaw.includes('red card') || eventTypeRaw.includes('thẻ đỏ')) {
      eventType = 'card_red';
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

// === BONGDALU PARSER HELPERS ===
function parseJsArrayLiteral(str) {
  const tokens = [];
  let i = 0;
  while (i < str.length) {
    const char = str[i];
    if (char === '[' || char === ']' || char === ',') {
      tokens.push(char);
      i++;
    } else if (char === "'" || char === '"') {
      const quote = char;
      let val = '';
      i++;
      while (i < str.length && str[i] !== quote) {
        if (str[i] === '\\') {
          val += str[i + 1];
          i += 2;
        } else {
          val += str[i];
          i++;
        }
      }
      tokens.push({ type: 'string', value: val });
      i++; 
    } else if (/\s/.test(char)) {
      i++; 
    } else {
      let val = '';
      while (i < str.length && str[i] !== ',' && str[i] !== ']' && str[i] !== '[' && !/\s/.test(str[i])) {
        val += str[i];
        i++;
      }
      if (val === 'true' || val === 'True') {
        tokens.push(true);
      } else if (val === 'false' || val === 'False') {
        tokens.push(false);
      } else if (val === 'null') {
        tokens.push(null);
      } else if (val === '') {
        // empty
      } else if (!isNaN(Number(val))) {
        tokens.push(Number(val));
      } else {
        tokens.push(val); 
      }
    }
  }

  if (tokens[0] !== '[') return null;
  const result = [];
  let expectedValue = true; 
  
  for (let t = 1; t < tokens.length - 1; t++) {
    const tok = tokens[t];
    if (tok === ',') {
      if (expectedValue) {
        result.push(null);
      }
      expectedValue = true;
    } else if (tok === ']') {
      break;
    } else {
      const val = (tok && typeof tok === 'object' && tok.type === 'string') ? tok.value : tok;
      result.push(val);
      expectedValue = false;
    }
  }
  if (expectedValue && result.length > 0 && tokens[tokens.length - 2] === ',') {
    result.push(null);
  }
  return result;
}

function parseBongdaluJs(jsText) {
  const A = [];
  const B = [];
  const C = [];
  let matchcount = 0;
  let sclasscount = 0;
  let lastCreateTime_bfIndex = '';

  const worldCupBIndices = new Set();
  const aCandidates = [];

  let pos = 0;
  while (pos < jsText.length) {
    let nextNL = jsText.indexOf('\n', pos);
    if (nextNL === -1) nextNL = jsText.length;

    // Fast check: Skip leading spaces if any
    let start = pos;
    while (start < nextNL && (jsText[start] === ' ' || jsText[start] === '\t' || jsText[start] === '\r')) {
      start++;
    }

    if (start < nextNL) {
      const char = jsText[start];
      if (char === 'A' && jsText[start + 1] === '[') {
        aCandidates.push(jsText.substring(start, nextNL));
      } else if (char === 'B' && jsText[start + 1] === '[') {
        const line = jsText.substring(start, nextNL);
        const lineLower = line.toLowerCase();
        if (lineLower.includes('world cup') || lineLower.includes('worldcup')) {
          const closeIdx = line.indexOf(']');
          if (closeIdx !== -1) {
            const idx = parseInt(line.substring(2, closeIdx), 10);
            const eqIdx = line.indexOf('=', closeIdx);
            if (eqIdx !== -1) {
              let arrStr = line.substring(eqIdx + 1).trim();
              if (arrStr.endsWith(';')) arrStr = arrStr.slice(0, -1);
              B[idx] = parseJsArrayLiteral(arrStr);
              worldCupBIndices.add(idx);
            }
          }
        }
      } else if (char === 'v') {
        const line = jsText.substring(start, nextNL);
        if (line.startsWith('var matchcount')) {
          const eqIdx = line.indexOf('=');
          if (eqIdx !== -1) {
            let valStr = line.substring(eqIdx + 1).trim();
            if (valStr.endsWith(';')) valStr = valStr.slice(0, -1);
            matchcount = parseInt(valStr, 10);
          }
        } else if (line.startsWith('var sclasscount')) {
          const eqIdx = line.indexOf('=');
          if (eqIdx !== -1) {
            let valStr = line.substring(eqIdx + 1).trim();
            if (valStr.endsWith(';')) valStr = valStr.slice(0, -1);
            sclasscount = parseInt(valStr, 10);
          }
        } else if (line.startsWith('var lastCreateTime_bfIndex')) {
          const eqIdx = line.indexOf('=');
          if (eqIdx !== -1) {
            let valStr = line.substring(eqIdx + 1).trim();
            if (valStr.endsWith(';')) valStr = valStr.slice(0, -1);
            if (valStr.startsWith('"') || valStr.startsWith("'")) {
              lastCreateTime_bfIndex = valStr.slice(1, -1);
            } else {
              lastCreateTime_bfIndex = valStr;
            }
          }
        }
      }
    }
    pos = nextNL + 1;
  }

  // Parse only A matches that belong to World Cup leagues
  for (let i = 0; i < aCandidates.length; i++) {
    const line = aCandidates[i];
    const eqIdx = line.indexOf('=[');
    if (eqIdx !== -1) {
      const content = line.substring(eqIdx + 2);
      const commaIdx = content.indexOf(',');
      if (commaIdx !== -1) {
        const nextCommaIdx = content.indexOf(',', commaIdx + 1);
        if (nextCommaIdx !== -1) {
          const leagueIdStr = content.substring(commaIdx + 1, nextCommaIdx).trim();
          const leagueIdx = parseInt(leagueIdStr, 10);
          if (worldCupBIndices.has(leagueIdx)) {
            const closeIdx = line.indexOf(']');
            if (closeIdx !== -1) {
              const idx = parseInt(line.substring(2, closeIdx), 10);
              let arrStr = line.substring(eqIdx + 1).trim();
              if (arrStr.endsWith(';')) arrStr = arrStr.slice(0, -1);
              A[idx] = parseJsArrayLiteral(arrStr);
            }
          }
        }
      }
    }
  }

  return { A, B, C, matchcount, sclasscount, lastCreateTime_bfIndex };
}

function removeNeutralSuffix(name) {
  if (!name) return '';
  return name.replace(/<font[^>]*>\s*\(N\)\s*<\/font>/gi, '')
             .replace(/\s*\(N\)\s*$/gi, '')
             .replace(/<[^>]*>/g, '')
             .trim();
}

function parseUtcDate(str) {
  if (!str) return null;
  const parts = str.match(/(\d+)-(\d+)-(\d+)\s+(\d+):(\d+):(\d+)/);
  if (!parts) return new Date(str);
  return new Date(Date.UTC(
    parseInt(parts[1], 10),
    parseInt(parts[2], 10) - 1,
    parseInt(parts[3], 10),
    parseInt(parts[4], 10),
    parseInt(parts[5], 10),
    parseInt(parts[6], 10)
  ));
}

async function fetchBongdaluLive(env) {
  const url = env.BONGDALU_LIVE_URL || "https://free.bongdalu.group/gf/data/bf_vn_nt.js";
  const randomUserAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  const response = await fetch(url, {
    headers: {
      'User-Agent': randomUserAgent,
      'Accept': '*/*',
      'Referer': 'https://free.bongdalu.group/free/freesoccer',
    },
    cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
  });

  if (!response.ok) {
    throw new Error(`Bongdalu returned HTTP ${response.status}`);
  }

  const jsText = await response.text();
  const parsed = parseBongdaluJs(jsText);
  const { A, B } = parsed;

  const matches = [];
  for (let i = 1; i < A.length; i++) {
    const match = A[i];
    if (!match) continue;

    const leagueInfo = B[match[1]];
    if (!leagueInfo) continue;

    const leagueId = leagueInfo[0];
    const leagueNameEn = leagueInfo[1] || '';
    const leagueNameVi = leagueInfo[8] || '';

    const isWorldCup = 
      leagueId === 75 || 
      leagueNameEn.toLowerCase().includes('world cup') || 
      leagueNameVi.toLowerCase().includes('world cup');

    if (!isWorldCup) continue;

    const homeName = removeNeutralSuffix(match[4]);
    const awayName = removeNeutralSuffix(match[5]);

    const bongdaluStatus = match[8];
    let status = 'scheduled';
    let phase = null;
    let minute = null;
    let isHt = false;

    if (bongdaluStatus === 0) {
      status = 'scheduled';
    } else if (bongdaluStatus === -1) {
      status = 'finished';
      phase = 'FT';
      minute = 90;
    } else if (bongdaluStatus > 0) {
      status = 'live';
      isHt = bongdaluStatus === 2;

      // Mapping phase từ status code Bongdalu (đã xác nhận từ dữ liệu live):
      // 1=Hiệp 1, 2=Nghỉ giữa hiệp, 3=Hiệp 2, 4=Hiệp phụ, 5=Penalty
      // Phút sẽ được tính trong refreshLiveCacheAndSync từ kickoff_utc (DB)
      if (bongdaluStatus === 1) {
        phase = '1H';
      } else if (bongdaluStatus === 2) {
        phase = 'HT';
        minute = 45;
      } else if (bongdaluStatus === 3) {
        phase = '2H';
      } else if (bongdaluStatus === 4) {
        phase = 'ET';
      } else if (bongdaluStatus === 5) {
        phase = 'PEN';
      } else {
        phase = '1H';
      }
    } else {
      // Các trạng thái âm (ngoài -1 đã xử lý ở trên)
      if (bongdaluStatus === -10) {
        status = 'cancelled';
      } else if (bongdaluStatus === -11) {
        status = 'scheduled'; // To be determined
      } else if (bongdaluStatus === -12 || bongdaluStatus === -14) {
        status = 'postponed';
      } else if (bongdaluStatus === -13) {
        status = 'cancelled'; // Interrupted
      } else {
        status = 'scheduled';
      }
    }

    const homeScore = match[9] !== null && match[9] !== undefined ? Number(match[9]) : null;
    const awayScore = match[10] !== null && match[10] !== undefined ? Number(match[10]) : null;

    matches.push({
      homeName,
      awayName,
      homeScore,
      awayScore,
      status,
      phase,
      minute,
      isHt,
      // match[7] = thời gian bắt đầu giai đoạn hiện tại từ Bongdalu
      // (cập nhật khi chuyển hiệp, dùng làm fallback cho period transition tracking)
      bongdaluPeriodStart: match[7] || null,
      redCards: {
        home: Number(match[13]) || 0,
        away: Number(match[14]) || 0
      },
      yellowCards: {
        home: Number(match[15]) || 0,
        away: Number(match[16]) || 0
      }
    });
  }

  return matches;
}

async function scrapeAndSyncMatchEvents(env, ctx, matchId, homeTeamName, awayTeamName) {
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
  } catch (err) {
    console.warn(`Failed to sync events for match ${matchId} from thethao247:`, err.message);
  }
}

async function fetchThethao247Live(env) {
  const url = env.THETHAO247_LIVE_URL || 'https://thethao247.vn/livescores/';

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

    // Extract time / minute early
    const timeBlockMatch = block.match(/<div class="time">([\s\S]*?)<\/div>/);
    let timeText = '';
    if (timeBlockMatch) {
      const timeHtml = timeBlockMatch[1];
      timeText = timeHtml.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }

    // Extract status
    const moreBlockMatch = block.match(/<div class="more">([\s\S]*?)<\/div>/);
    let statusText = '';
    if (moreBlockMatch) {
      statusText = moreBlockMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }

    const isLive = block.includes('is_live') || block.includes('blink_me') || statusText.toLowerCase().includes('live');
    const isFinished = 
      statusText.toLowerCase() === 'ft' || statusText.toLowerCase() === 'hết giờ' || statusText.toLowerCase().includes('finished') || statusText.toLowerCase().includes('ended') ||
      timeText.toLowerCase() === 'ft' || timeText.toLowerCase() === 'hết giờ' || timeText.toLowerCase().includes('finished') || timeText.toLowerCase().includes('ended');

    let minute = null;
    let isHt = false;
    if (timeBlockMatch && isLive) {
      const matchMin = timeText.match(/(\d+)/);
      if (matchMin) {
        minute = Number(matchMin[1]);
      }
      if (timeText.toUpperCase().includes('HT') || timeText.includes('giữa hiệp') || timeText.toLowerCase() === 'hết hiệp 1') {
        isHt = true;
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
    .replace(/&amp;/g, '')
    .replace(/amp/g, '')
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
  if ((cleanScraped.includes('arab') || cleanScraped.includes('arap')) && (cleanVi.includes('saudi') || cleanEn.includes('saudi'))) return true;
  if (cleanScraped.includes('sec') && (cleanVi.includes('czechia') || cleanEn.includes('czechia'))) return true;
  if (cleanScraped === 'thonk' && cleanVi === 'thonhiky') return true;

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

// --- WC2026 Schedule Sync Logic ---

const ROUND_LABELS = {
  group: 'Vòng bảng',
  R32: 'Vòng 32 đội',
  R16: 'Vòng 16 đội',
  QF: 'Tứ kết',
  SF: 'Bán kết',
  '3rd': 'Tranh hạng ba',
  final: 'Chung kết',
};

const TEAM_VI = {
  ALG: 'Algeria',
  ARG: 'Argentina',
  AUS: 'Úc',
  AUT: 'Áo',
  BEL: 'Bỉ',
  BIH: 'Bosnia-Herzegovina',
  BRA: 'Brazil',
  CAN: 'Canada',
  CIV: 'Bờ Biển Ngà',
  COD: 'Congo DR',
  COL: 'Colombia',
  CPV: 'Cabo Verde',
  CRO: 'Croatia',
  CUW: 'Curaçao',
  CZE: 'Czechia',
  ECU: 'Ecuador',
  EGY: 'Ai Cập',
  ENG: 'Anh',
  ESP: 'Tây Ban Nha',
  FRA: 'Pháp',
  GER: 'Đức',
  GHA: 'Ghana',
  HAI: 'Haiti',
  IRN: 'Iran',
  IRQ: 'Iraq',
  JOR: 'Jordan',
  JPN: 'Nhật Bản',
  KOR: 'Hàn Quốc',
  KSA: 'Ả Rập Saudi',
  MAR: 'Ma Rốc',
  MEX: 'Mexico',
  NED: 'Hà Lan',
  NOR: 'Na Uy',
  NZL: 'New Zealand',
  PAN: 'Panama',
  PAR: 'Paraguay',
  POR: 'Bồ Đào Nha',
  QAT: 'Qatar',
  RSA: 'Nam Phi',
  SCO: 'Scotland',
  SEN: 'Senegal',
  SUI: 'Thụy Sĩ',
  SWE: 'Thụy Điển',
  TUN: 'Tunisia',
  TUR: 'Thổ Nhĩ Kỳ',
  URU: 'Uruguay',
  USA: 'Mỹ',
  UZB: 'Uzbekistan',
};

const FLAG_CODES = {
  ALG: 'dz',
  ARG: 'ar',
  AUS: 'au',
  AUT: 'at',
  BEL: 'be',
  BIH: 'ba',
  BRA: 'br',
  CAN: 'ca',
  CIV: 'ci',
  COD: 'cd',
  COL: 'co',
  CPV: 'cv',
  CRO: 'hr',
  CUW: 'cw',
  CZE: 'cz',
  ECU: 'ec',
  EGY: 'eg',
  ENG: 'gb-eng',
  ESP: 'es',
  FRA: 'fr',
  GER: 'de',
  GHA: 'gh',
  HAI: 'ht',
  IRN: 'ir',
  IRQ: 'iq',
  JOR: 'jo',
  JPN: 'jp',
  KOR: 'kr',
  KSA: 'sa',
  MAR: 'ma',
  MEX: 'mx',
  NED: 'nl',
  NOR: 'no',
  NZL: 'nz',
  PAN: 'pa',
  PAR: 'py',
  POR: 'pt',
  QAT: 'qa',
  RSA: 'za',
  SCO: 'gb-sct',
  SEN: 'sn',
  SUI: 'ch',
  SWE: 'se',
  TUN: 'tn',
  TUR: 'tr',
  URU: 'uy',
  USA: 'us',
  UZB: 'uz',
};

function normalizeApiStatus(status, phase) {
  if (status === 'completed' || phase === 'FT' || phase === 'FT_PEN') return 'finished';
  if (status === 'live' || status === 'in_progress') return 'live';
  if (status === 'postponed') return 'postponed';
  if (status === 'cancelled') return 'cancelled';
  return 'scheduled';
}

function mapApiTeam(team) {
  const flagCode = FLAG_CODES[team.code];
  return {
    id: team.id,
    code: team.code,
    name_en: team.name,
    name_vi: TEAM_VI[team.code] || team.name,
    group_name: team.group_name,
    flag_url: team.flag_url || (flagCode ? `https://flagcdn.com/w160/${flagCode}.png` : null),
    source_payload: team,
    updated_at: new Date().toISOString(),
  };
}

function mapApiMatch(match) {
  return {
    id: match.id,
    match_number: match.match_number,
    round_code: match.round,
    round_name: ROUND_LABELS[match.round] || match.round,
    group_name: match.group_name,
    home_team_id: match.home_team_id,
    away_team_id: match.away_team_id,
    home_team_name: match.home_team,
    away_team_name: match.away_team,
    home_team_code: match.home_team_code,
    away_team_code: match.away_team_code,
    stadium_id: match.stadium_id,
    stadium_name: match.stadium,
    stadium_city: match.stadium_city,
    stadium_country: match.stadium_country,
    kickoff_utc: match.kickoff_utc,
    status: normalizeApiStatus(match.status, match.phase),
    phase: match.phase,
    home_score: match.home_score,
    away_score: match.away_score,
    home_pen: match.home_pen,
    away_pen: match.away_pen,
    source_payload: match,
    updated_at: new Date().toISOString(),
  };
}

async function upsertSupabaseRows(env, path, payload) {
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase Worker environment variables');
  }

  const response = await fetch(`${supabaseUrl}${path}`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Supabase upsert returned HTTP ${response.status}: ${await response.text()}`);
  }
}

async function syncWc2026Schedule(env) {
  console.log('Starting scheduled schedule sync from wc2026api...');
  try {
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

    const rawTeams = await teamsRes.json();
    const rawMatches = await matchesRes.json();

    console.log(`Fetched ${rawTeams.length} teams and ${rawMatches.length} matches from API`);

    const mappedTeams = rawTeams.map(mapApiTeam);
    const mappedMatches = rawMatches.map(mapApiMatch);

    // Upsert teams and matches
    await upsertSupabaseRows(env, '/rest/v1/wc2026_teams', mappedTeams);
    await upsertSupabaseRows(env, '/rest/v1/wc2026_matches', mappedMatches);

    console.log('Successfully completed schedule sync from wc2026api');
  } catch (error) {
    console.error('Error during scheduled schedule sync:', error.message);
    throw error;
  }
}

function dataHasChanged(oldData, newData) {
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
    if (o.minute !== n.minute) return true;
    if (o.home_score !== n.home_score) return true;
    if (o.away_score !== n.away_score) return true;
    if (o.home_pen !== n.home_pen) return true;
    if (o.away_pen !== n.away_pen) return true;

    // Compare red cards and yellow cards
    const oRedHome = o.red_cards?.home ?? 0;
    const nRedHome = n.red_cards?.home ?? 0;
    const oRedAway = o.red_cards?.away ?? 0;
    const nRedAway = n.red_cards?.away ?? 0;
    if (oRedHome !== nRedHome || oRedAway !== nRedAway) return true;

    const oYellowHome = o.yellow_cards?.home ?? 0;
    const nYellowHome = n.yellow_cards?.home ?? 0;
    const oYellowAway = o.yellow_cards?.away ?? 0;
    const nYellowAway = n.yellow_cards?.away ?? 0;
    if (oYellowHome !== nYellowHome || oYellowAway !== nYellowAway) return true;
    
    // Compare events list
    const oEvents = o.events || [];
    const nEvents = n.events || [];
    if (oEvents.length !== nEvents.length) return true;
    for (let j = 0; j < oEvents.length; j++) {
      if (oEvents[j].event_type !== nEvents[j].event_type) return true;
      if (oEvents[j].minute !== nEvents[j].minute) return true;
      if (oEvents[j].player_name !== nEvents[j].player_name) return true;
    }
  }
  return false;
}

function dataHasChangedIncludingMinutes(oldData, newData) {
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
    if (o.minute !== n.minute) return true;
    if (o.home_score !== n.home_score) return true;
    if (o.away_score !== n.away_score) return true;
    if (o.home_pen !== n.home_pen) return true;
    if (o.away_pen !== n.away_pen) return true;

    const oRedHome = o.red_cards?.home ?? 0;
    const nRedHome = n.red_cards?.home ?? 0;
    const oRedAway = o.red_cards?.away ?? 0;
    const nRedAway = n.red_cards?.away ?? 0;
    if (oRedHome !== nRedHome || oRedAway !== nRedAway) return true;

    const oYellowHome = o.yellow_cards?.home ?? 0;
    const nYellowHome = n.yellow_cards?.home ?? 0;
    const oYellowAway = o.yellow_cards?.away ?? 0;
    const nYellowAway = n.yellow_cards?.away ?? 0;
    if (oYellowHome !== nYellowHome || oYellowAway !== nYellowAway) return true;
  }
  return false;
}

// --- World Cup 2026 Daily Prediction Scraper Logic ---

const nameMap = {
  'cộng hòa séc': 'CZE',
  'ch séc': 'CZE',
  'séc': 'CZE',
  'nam phi': 'RSA',
  'thụy sĩ': 'SUI',
  'bosnia & herzegovina': 'BIH',
  'bosnia-herzegovina': 'BIH',
  'bosnia': 'BIH',
  'canada': 'CAN',
  'qatar': 'QAT',
  'uzbekistan': 'UZB',
  'colombia': 'COL',
  'algeria': 'ALG',
  'argentina': 'ARG',
  'úc': 'AUS',
  'australia': 'AUS',
  'áo': 'AUT',
  'bỉ': 'BEL',
  'brazil': 'BRA',
  'bờ biển ngà': 'CIV',
  'côte d\'ivoire': 'CIV',
  'congo dr': 'COD',
  'chdc congo': 'COD',
  'cabo verde': 'CPV',
  'cape verde': 'CPV',
  'croatia': 'CRO',
  'curaçao': 'CUW',
  'curacao': 'CUW',
  'ecuador': 'ECU',
  'ai cập': 'EGY',
  'anh': 'ENG',
  'tây ban nha': 'ESP',
  'pháp': 'FRA',
  'đức': 'GER',
  'ghana': 'GHA',
  'haiti': 'HAI',
  'iran': 'IRN',
  'iraq': 'IRQ',
  'jordan': 'JOR',
  'nhật bản': 'JPN',
  'hàn quốc': 'KOR',
  'ả rập saudi': 'KSA',
  'saudi arabia': 'KSA',
  'ma rốc': 'MAR',
  'morocco': 'MAR',
  'mexico': 'MEX',
  'hà lan': 'NED',
  'na uy': 'NOR',
  'new zealand': 'NZL',
  'panama': 'PAN',
  'paraguay': 'PAR',
  'bồ đào nha': 'POR',
  'scotland': 'SCO',
  'senegal': 'SEN',
  'thụy diễn': 'SWE',
  'thụy điển': 'SWE',
  'tunisia': 'TUN',
  'thổ nhĩ kỳ': 'TUR',
  'thổ n. k.': 'TUR',
  'uruguay': 'URU',
  'mỹ': 'USA',
  'usa': 'USA'
};

function getTeamCode(name) {
  if (!name) return null;
  const clean = name.toLowerCase().trim();
  return nameMap[clean] || null;
}

function getTeamNames(code, defaultName) {
  const names = Object.keys(nameMap).filter(k => nameMap[k] === code);
  if (defaultName && !names.includes(defaultName.toLowerCase().trim())) {
    names.push(defaultName.toLowerCase().trim());
  }
  return names;
}

function findScorePrediction($, homeCode, homeName, awayCode, awayName) {
  const homeTerms = getTeamNames(homeCode, homeName);
  const awayTerms = getTeamNames(awayCode, awayName);
  const mediaTerms = [
    'sportskeeda', 'sports mole', 'sportsmole', 'standard', 'whoscored', 'mole', 
    'siêu máy tính', 'máy tính', 'nhà báo', 'chuyên gia',
    'phạt góc', 'thẻ phạt', 'bàn thắng', 'thẻ vàng', 'góc'
  ];
  
  const blocks = [];
  $('#content_detail').find('p, li, h2, h3, h4').each((i, el) => {
    const txt = $(el).text().trim();
    if (txt) blocks.push(txt);
  });
  
  const scoreRegex = /\b\d+\s*[-–]\s*\d+\b/;
  
  for (const block of blocks) {
    const blockLower = block.toLowerCase();
    if (mediaTerms.some(term => blockLower.includes(term))) continue;

    const sentences = block.split(/[.!?\n]/);
    for (let sentence of sentences) {
      sentence = sentence.trim();
      if (!sentence) continue;
      
      const sentenceLower = sentence.toLowerCase();
      
      if (sentenceLower.includes('dự đoán')) {
        if (scoreRegex.test(sentence)) {
          const hasHome = homeTerms.some(term => sentenceLower.includes(term));
          const hasAway = awayTerms.some(term => sentenceLower.includes(term));
          
          if (hasHome && hasAway) {
            return sentence;
          }
        }
      }
    }
  }
  
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const blockLower = block.toLowerCase();
    if (blockLower.includes('dự đoán tỷ số') && !blockLower.includes('truyền thông')) {
      const hasHome = homeTerms.some(term => blockLower.includes(term));
      const hasAway = awayTerms.some(term => blockLower.includes(term));
      
      if (hasHome && hasAway && i + 1 < blocks.length) {
        const nextBlock = blocks[i + 1];
        if (scoreRegex.test(nextBlock)) {
          return `${block}: ${nextBlock}`;
        }
      }
    }
  }
  
  return '';
}

function getParagraphsUntilNextHeadingOrLi($, startEl) {
  let result = [];
  let current = startEl;
  if (startEl.is('li') && startEl.parent().is('ul, ol')) {
    current = startEl.parent();
  }
  let next = current.next();
  while (next.length && !next.is('h2, h3, h4, li, ul, ol')) {
    if (next.is('p')) {
      const text = next.text().trim();
      if (text) {
        result.push(text);
      }
    }
    next = next.next();
  }
  return result.join('\n\n');
}

function parsePredictionPage(html, url) {
  const $ = cheerio.load(html);
  const title = $('h1#title_detail').text().trim() || $('h1').first().text().trim();
  const sapo = $('.sapo_detail').text().trim();

  let forceInfo = { home: '', away: '' };
  const forceHeader = $('h2, h3').filter((i, el) => $(el).text().toLowerCase().includes('lực lượng')).first();
  if (forceHeader.length) {
    const nextList = forceHeader.nextAll('ul, ol').first();
    if (nextList.length) {
      nextList.find('li').each((i, li) => {
        const text = $(li).text().trim();
        const parts = text.split(':');
        const prefix = parts[0] ? parts[0].trim() : '';
        const mappedCode = getTeamCode(prefix);

        if (mappedCode) {
          if (i === 0) forceInfo.home = text;
          else if (i === 1) forceInfo.away = text;
        } else {
          if (i === 0) forceInfo.home = text;
          if (i === 1) forceInfo.away = text;
        }
      });
    }
  }

  let formInfo = { home: '', away: '', h2h: '' };
  const formHeader = $('h2, h3').filter((i, el) => $(el).text().toLowerCase().includes('phong độ')).first();
  if (formHeader.length) {
    const nextList = formHeader.nextAll('ul, ol').first();
    if (nextList.length) {
      nextList.find('li').each((i, li) => {
        const text = $(li).text().trim();
        if (text.toLowerCase().includes('lịch sử đối đầu') || text.toLowerCase().includes('đối đầu')) {
          formInfo.h2h = text;
        } else {
          if (i === 0) formInfo.home = text;
          if (i === 1) formInfo.away = text;
        }
      });
    }
  }

  let predictionInfo = { goals: '', corners: '', cards: '', score: '' };
  $('#content_detail').find('li, p, h3, h4').each((i, el) => {
    const text = $(el).text().trim();
    if (text.toLowerCase().includes('dự đoán số bàn thắng') || text.toLowerCase().includes('dự đoán bàn thắng')) {
      const parsed = getParagraphsUntilNextHeadingOrLi($, $(el));
      if (parsed && parsed.trim() && parsed.trim().length > predictionInfo.goals.length) {
        predictionInfo.goals = parsed.trim();
      }
    } else if (text.toLowerCase().includes('dự đoán phạt góc')) {
      const parsed = getParagraphsUntilNextHeadingOrLi($, $(el));
      if (parsed && parsed.trim() && parsed.trim().length > predictionInfo.corners.length) {
        predictionInfo.corners = parsed.trim();
      }
    } else if (text.toLowerCase().includes('dự đoán thẻ phạt')) {
      const parsed = getParagraphsUntilNextHeadingOrLi($, $(el));
      if (parsed && parsed.trim() && parsed.trim().length > predictionInfo.cards.length) {
        predictionInfo.cards = parsed.trim();
      }
    } else if (text.toLowerCase().includes('dự đoán tỷ số') && !text.toLowerCase().includes('truyền thông')) {
      let scoreText = '';
      let current = $(el);
      if ($(el).is('li') && $(el).parent().is('ul, ol')) {
        current = $(el).parent();
      }
      let next = current.next();
      while (next.length && !next.is('h2, h3, h4, li, ul, ol')) {
        if (next.is('p')) {
          scoreText += next.text().trim() + ' ';
        }
        next = next.next();
      }
      scoreText = scoreText.trim();
      if (scoreText) {
        if (scoreText.length > predictionInfo.score.length) {
          predictionInfo.score = scoreText;
        }
      } else if (!predictionInfo.score) {
        predictionInfo.score = text;
      }
    }
  });

  let mediaPrediction = {};
  const mediaHeader = $('h3, h2').filter((i, el) => $(el).text().toLowerCase().includes('truyền thông') || $(el).text().toLowerCase().includes('sportskeeda')).first();
  if (mediaHeader.length) {
    const nextList = mediaHeader.nextAll('ul, ol').first();
    if (nextList.length) {
      nextList.find('li').each((i, li) => {
        const text = $(li).text().trim();
        const parts = text.split(':');
        if (parts.length >= 2) {
          const mediaName = parts[0].replace('dự đoán', '').trim();
          mediaPrediction[mediaName] = parts.slice(1).join(':').trim();
        } else {
          mediaPrediction[`Media ${i + 1}`] = text;
        }
      });
    }
  }

  let fullAnalysis = '';
  const analysisHeader = $('h2').filter((i, el) => {
    const txt = $(el).text().toLowerCase();
    return txt.includes('nhận định') && !txt.includes('tỷ số') && !txt.includes('lực lượng') && !txt.includes('phong độ');
  }).first();
  if (analysisHeader.length) {
    let paragraphs = [];
    let next = analysisHeader.next();
    while (next.length && !next.is('h2, h3, h4')) {
      if (next.is('p')) {
        const text = next.text().trim();
        if (text) {
          paragraphs.push(text);
        }
      }
      next = next.next();
    }
    fullAnalysis = paragraphs.join('\n\n');
  } else {
    let paragraphs = [];
    $('#content_detail').find('p').each((i, p) => {
      const text = $(p).text().trim();
      if (text && !text.toLowerCase().includes('sportskeeda') && !text.toLowerCase().includes('sports mole')) {
        paragraphs.push(text);
      }
    });
    fullAnalysis = paragraphs.slice(Math.floor(paragraphs.length / 2)).join('\n\n');
  }

  return {
    source_url: url,
    title,
    sapo,
    force_info: forceInfo,
    form_info: formInfo,
    prediction_info: predictionInfo,
    media_prediction: mediaPrediction,
    full_analysis: fullAnalysis
  };
}

async function syncPredictionsToday(env) {
  const startedAt = new Date().toISOString();
  console.log('Starting syncPredictionsToday scraper...');
  try {
    // 1. Get matches and teams from Supabase
    const [dbMatches, dbTeams] = await Promise.all([
      getSupabaseRows(env, '/rest/v1/wc2026_matches?select=*'),
      getSupabaseRows(env, '/rest/v1/wc2026_teams?select=*')
    ]).catch(error => {
      console.warn('Failed to fetch matches/teams from Supabase:', error.message);
      return [[], []];
    });

    const todayYMD = getVietnamYMD(new Date());
    const todayMatches = dbMatches.filter(m => getVietnamYMD(m.kickoff_utc) === todayYMD);

    console.log(`Found ${todayMatches.length} matches scheduled for today (${todayYMD}).`);
    if (todayMatches.length === 0) {
      return {
        status: 'success',
        message: `No matches scheduled for today (${todayYMD}). Skipping scraper.`,
        scraped_count: 0
      };
    }

    const todayMatchTeams = todayMatches.map(m => ({
      match: m,
      homeCodes: getTeamNames(m.home_team_code, m.home_team_name),
      awayCodes: getTeamNames(m.away_team_code, m.away_team_name),
    }));

    // 2. Fetch livescores page
    const livescoresUrl = 'https://thethao247.vn/livescores/the-gioi/vo-dich-the-gioi/';
    const response = await fetch(livescoresUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch livescores page: HTTP ${response.status}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract prediction links
    const predictionLinks = [];
    $('a').each((i, a) => {
      const href = $(a).attr('href');
      const text = $(a).text().trim();
      if (href && href.includes('nhan-dinh') && href.endsWith('.html') && text.includes('Nhận định')) {
        if (!predictionLinks.some(link => link.url === href)) {
          predictionLinks.push({ url: href, text });
        }
      }
    });

    console.log(`Found ${predictionLinks.length} prediction links total on page.`);

    // 3. Filter prediction links that match today's matches
    const linksToScrape = [];
    for (const link of predictionLinks) {
      const textLower = link.text.toLowerCase();
      const urlLower = link.url.toLowerCase();

      const matchedMatch = todayMatchTeams.find(t => {
        const homeMatched = t.homeCodes.some(name => {
          const cleanName = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
          return textLower.includes(name) || urlLower.includes(cleanName);
        });
        const awayMatched = t.awayCodes.some(name => {
          const cleanName = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
          return textLower.includes(name) || urlLower.includes(cleanName);
        });
        return homeMatched && awayMatched;
      });

      if (matchedMatch) {
        linksToScrape.push({
          link,
          match: matchedMatch.match
        });
      }
    }

    console.log(`Filtered down to ${linksToScrape.length} links corresponding to today's matches.`);

    let matchedCount = 0;
    for (const item of linksToScrape) {
      const { link, match } = item;
      console.log(`Scraping prediction for match ID ${match.id} (${match.home_team_code} vs ${match.away_team_code}) from: ${link.url}`);
      try {
        const detailRes = await fetch(link.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        if (!detailRes.ok) {
          console.warn(`Failed to fetch prediction detail: HTTP ${detailRes.status}`);
          continue;
        }
        const detailHtml = await detailRes.text();
        const parsed = parsePredictionPage(detailHtml, link.url);

        const mainScore = findScorePrediction(cheerio.load(detailHtml), match.home_team_code, match.home_team_name, match.away_team_code, match.away_team_name);
        if (mainScore) {
          console.log(`Found refined score prediction: "${mainScore}"`);
          parsed.prediction_info.score = mainScore;
        }

        const predictionRow = {
          match_id: match.id,
          source_url: link.url,
          title: parsed.title,
          sapo: parsed.sapo,
          force_info: parsed.force_info,
          form_info: parsed.form_info,
          prediction_info: parsed.prediction_info,
          media_prediction: parsed.media_prediction,
          full_analysis: parsed.full_analysis,
          updated_at: new Date().toISOString()
        };

        await upsertSupabaseRows(env, '/rest/v1/wc2026_match_predictions', [predictionRow]);
        console.log(`Successfully saved prediction for match ID ${match.id} to Supabase.`);
        matchedCount++;
      } catch (err) {
        console.error(`Error scraping prediction link ${link.url}:`, err);
      }
    }

    const finishedAt = new Date().toISOString();
    const log = {
      source: 'thethao247_predictions_worker',
      status: 'success',
      message: `Worker successfully scraped and saved ${matchedCount} predictions for today's matches.`,
      rows_read: linksToScrape.length,
      rows_written: matchedCount,
      started_at: startedAt,
      finished_at: finishedAt
    };
    
    await upsertSupabaseRows(env, '/rest/v1/wc2026_api_sync_log', [log]);

    return {
      status: 'success',
      message: log.message,
      scraped_count: matchedCount
    };
  } catch (error) {
    console.error('Error during prediction scraping sync:', error);
    try {
      await upsertSupabaseRows(env, '/rest/v1/wc2026_api_sync_log', [{
        source: 'thethao247_predictions_worker',
        status: 'error',
        message: error.message,
        started_at: startedAt,
        finished_at: new Date().toISOString()
      }]);
    } catch (logErr) {
      console.error('Failed to log error to sync logs:', logErr.message);
    }
    return {
      status: 'error',
      message: error.message
    };
  }
}

function getVietnamYMD(kickoffUtc) {
  const matchDate = new Date(kickoffUtc);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(matchDate);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return `${year}-${month}-${day}`;
}
