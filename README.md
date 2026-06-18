# Lich World Cup 2026

Next.js static app for Cloudflare Pages, backed by Supabase and a Cloudflare Worker realtime proxy.

## Development

```bash
npm run dev
```

Open `http://localhost:3000`.

## Supabase

Project ID: `qblkjphwwnrexlhfqoyo`

All database schema/data changes must be made through Supabase MCP. Use [supabase_schema.sql](./supabase_schema.sql) with MCP `execute_sql` to reset the old tables and create the fresh `wc2026_*` schema.

Tables:

- `wc2026_teams`: teams from `https://api.wc2026api.com/teams`
- `wc2026_matches`: 104-match schedule from `https://api.wc2026api.com/matches`
- `wc2026_match_live_snapshots`: optional persisted live snapshots from Worker/SofaScore
- `wc2026_match_events`: optional live events
- `wc2026_api_sync_log`: sync history

Sync schedule data:

```bash
npm run sync:wc2026
```

Required local env:

```env
NEXT_PUBLIC_SUPABASE_URL=https://qblkjphwwnrexlhfqoyo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
WC2026_API_KEY=...
NEXT_PUBLIC_WORKER_API_BASE_URL=...
```

## Realtime Flow

```text
SofaScore internal API
  -> Cloudflare Worker proxy + KV cache 30s
  -> GET /live, /matches, /standings
  -> Webapp polls /live every 30s
```

Worker source: [scripts/cloudflare_worker.js](./scripts/cloudflare_worker.js)

Worker commands:

```bash
npm run worker:dev
npm run worker:deploy
```

Worker env/bindings:

- `WC2026_CACHE`: KV namespace binding
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SOFASCORE_LIVE_URL`

Cloudflare cron is configured in [wrangler.worker.toml](./wrangler.worker.toml). The cron refresh runs every minute; KV cache TTL is 30 seconds so webapp polling can hit Worker cache without calling the external live provider.

## Production Deploy

This project exports static HTML to `out/`. Deploy directly to Cloudflare Pages production using branch `main`.

```bash
npm run build
npx wrangler pages deploy out --project-name lichworldcup --branch main
```
