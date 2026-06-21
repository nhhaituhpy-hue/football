import { syncPredictionsToday } from './jobs/prediction-sync';
import { syncWc2026Schedule } from './jobs/schedule-sync';
import { syncOddsFromHttp } from './jobs/odds-sync';
import { handlePublicRoutes } from './routes/public';
import { handleAdminRoutes } from './routes/admin';
import { LiveCacheObject } from './realtime/live-cache-do';
import { makeCorsHeaders, jsonCors } from './utils';

const worker = {
  async scheduled(event: any, env: any, ctx: any): Promise<void> {
    if (event.cron === "0 1 * * *") {
      ctx.waitUntil(syncPredictionsToday(env));
    } else if (event.cron === "0 */6 * * *") {
      ctx.waitUntil(syncWc2026Schedule(env));
      ctx.waitUntil(syncOddsFromHttp(env, true)); // Full sync every 6 hours
    } else {
      ctx.waitUntil(syncOddsFromHttp(env, false)); // Express sync (live + <24h)
      const id = env.LIVE_CACHE_DO.idFromName("global_live_cache");
      const obj = env.LIVE_CACHE_DO.get(id);
      ctx.waitUntil(obj.fetch("http://do/start-alarm"));
    }
  },

  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: makeCorsHeaders(request) });

    const url = new URL(request.url);
    const isCacheablePath = ['/live', '/matches', '/standings'].includes(url.pathname);
    const force = url.searchParams.get('force') === 'true';

    // Try to fetch from Cloudflare Cache API (exclude /live from CDN cache as DO is fast and we want live updates)
    const cache = (caches as any).default;
    const cacheKey = new Request(url.toString(), request);
    if (isCacheablePath && url.pathname !== '/live' && request.method === 'GET' && !force) {
      try {
        const cachedResponse = await cache.match(cacheKey);
        if (cachedResponse) {
          return cachedResponse;
        }
      } catch (cacheError: any) {
        console.warn('Cache match failed:', cacheError.message);
      }
    }

    try {
      // 1. Try admin routes
      const adminResponse = await handleAdminRoutes(request, env);
      if (adminResponse) return adminResponse;

      // 2. Try public routes
      const publicResponse = await handlePublicRoutes(request, env, ctx);
      if (publicResponse) {
        // Store the response in Cache API
        if (isCacheablePath && request.method === 'GET') {
          try {
            ctx.waitUntil(cache.put(cacheKey, publicResponse.clone()));
          } catch (cachePutError: any) {
            console.warn('Cache put failed:', cachePutError.message);
          }
        }
        return publicResponse;
      }

      return jsonCors(request, { error: 'Not found' }, 404);
    } catch (error: any) {
      return jsonCors(request, { error: error.message }, 500);
    }
  },
};

export { LiveCacheObject };
export default worker;
