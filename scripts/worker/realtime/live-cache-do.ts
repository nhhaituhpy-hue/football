import { getSupabaseRows } from '../repositories/supabase';
import { refreshLiveCacheAndSync } from '../jobs/live-refresh';
import { JSON_HEADERS } from '../config';

export class LiveCacheObject {
  state: any;
  env: any;
  latestLiveMatches: any;

  constructor(state: any, env: any) {
    this.state = state;
    this.env = env;
    this.latestLiveMatches = null;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/live') {
      // Check if client is requesting a WebSocket upgrade
      if (request.headers.get("Upgrade") === "websocket") {
        console.log("WebSocket connection request received.");
        const webSocketPair = new (globalThis as any).WebSocketPair();
        const [client, server] = Object.values(webSocketPair) as [any, any];

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
        } catch (err: any) {
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
        } as ResponseInit);
      }

      // Standard HTTP fetch (Fallback/Force)
      const force = url.searchParams.get('force') === 'true';

      // Nếu DO vừa thức dậy từ hibernate (in-memory cache trống),
      // scrape tươi 1 lần để lấy phút mới nhất trước khi trả kết quả
      if (force || !this.latestLiveMatches) {
        console.log(force ? "Force refresh requested." : "DO woke from hibernation, scraping fresh data...");
        try {
          await refreshLiveCacheAndSync(this.env, this);
        } catch (err: any) {
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

  async alarm(): Promise<void> {
    console.log("Durable Object alarm triggered. Running scrape step...");
    try {
      const result = await refreshLiveCacheAndSync(this.env, this);
      if (result.hasActiveOrUpcoming) {
        console.log("Active or upcoming matches remain. Scheduling next alarm in 60s...");
        await this.state.storage.setAlarm(Date.now() + 60000);
      } else {
        console.log("No active or upcoming matches. Alarm loop stopping.");
      }
    } catch (err: any) {
      console.error("Durable Object alarm execution failed:", err.message);
      // Try again in 60s in case of transient errors
      await this.state.storage.setAlarm(Date.now() + 60000);
    }
  }

  // WebSocket Hibernation Events
  webSocketMessage(ws: any, message: any): void {
    // We do not expect client messages; ignore
    console.log("WebSocket message received from client (ignored):", message);
  }

  webSocketClose(ws: any, code: number, reason: string, wasClean: boolean): void {
    console.log(`WebSocket closed. Code: ${code}, Reason: ${reason}, WasClean: ${wasClean}`);
    ws.close();
  }

  webSocketError(ws: any, error: any): void {
    console.error("WebSocket error:", error);
    ws.close();
  }
}
