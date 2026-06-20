# Refactor Current Update — 2026-06-20

## Completed in this continuation

- Deployed frontend to Cloudflare Pages production:
  `npx wrangler pages deploy out --project-name lichworldcup --branch main`
- Wrangler deployment URL:
  `https://3d6f0830.lichworldcup.pages.dev`
- Smoke tested Pages:
  - `/` returned 200.
  - `/admin/` returned 200.
  - production alias `https://lichworldcup.pages.dev/` returned 200.
- Smoke tested Worker unauthenticated admin mutation:
  - `POST /sync-events-today` without Bearer token returned 401.
  - `GET /sync-events-today` returned 405 and did not trigger mutation.
- Re-verified local quality gates before deploy:
  - `npm run lint` passed with 0 errors and 18 warnings.
  - `npm run build` passed with 111 pages and 104 `/analysis/[matchId]` routes.
  - `node scripts/fix_static_paths.js` completed.
- Updated `supabase_schema.sql` local source schema:
  - added `wc2026_matches.highlight_url`.
  - added `wc2026_match_predictions` with FK to `wc2026_matches`.
  - added public read policy and SELECT grant for predictions.
  - added explicit write revoke for `anon` / `authenticated` in the source schema.
- Added `supabase_phase3_revoke_public_write.sql` as a pending MCP execution draft:
  - drops the two known `"Enable write for public"` policies.
  - revokes public write table privileges.
  - preserves SELECT for approved public tables.
  - includes verification queries for grants and policies.

## Still pending

- Production Supabase permission revoke/migration via Supabase MCP.
  - `.mcp.json` points to project `qblkjphwwnrexlhfqoyo`.
  - `https://mcp.supabase.com/mcp` is reachable and returns 401 without auth, which is expected.
  - This Codex session does not currently expose the Supabase MCP mutation tools (`execute_sql`, `get_advisors`), so DB production was not changed.
  - Prepared SQL exists locally in `supabase_phase3_revoke_public_write.sql`.
- Admin login/admin mutation E2E.
  - Requires using and then changing the temporary admin password.
  - Do not paste the password into logs or committed files.
- Authenticated non-admin 403 test.
  - Requires a non-admin Supabase Auth user/session.
- Schedule/live provider test after moving `WC2026_API_KEY` to Wrangler Secret.
  - Requires an authenticated admin trigger or waiting for cron/scheduled runtime evidence.

## Security status

- Frontend deploy no longer contains the old PIN/sessionStorage gate strings checked locally:
  - `0301`
  - `add_hl_auth`
- Frontend deploy/source scan did not find:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `service_role`
- Worker admin endpoint without Bearer token returns 401 on production.
- Production Supabase anon key still has write privileges:
  - `PATCH /rest/v1/wc2026_matches?id=eq.-999999999` returned 204.
  - `DELETE /rest/v1/wc2026_matches?id=eq.-999999999` returned 204.
  - These checks targeted a non-existent row, so no data was changed.
- Production DB write access for `anon` / `authenticated` is still the urgent unresolved risk until Phase 3 MCP SQL is executed and verified.
