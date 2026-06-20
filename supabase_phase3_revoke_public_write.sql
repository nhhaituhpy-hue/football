-- Phase 3 security migration draft.
-- Execute only through Supabase MCP on project qblkjphwwnrexlhfqoyo.
--
-- Goal:
-- - Public clients (anon/authenticated) can read approved public data.
-- - Public clients cannot INSERT/UPDATE/DELETE/TRUNCATE production data.
-- - Trusted server-side paths, such as the Cloudflare Worker service-role key,
--   remain responsible for mutations.

begin;

drop policy if exists "Enable write for public on matches" on public.wc2026_matches;
drop policy if exists "Enable write for public on match_events" on public.wc2026_match_events;

revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;

grant usage on schema public to anon, authenticated;

grant select on table
  public.wc2026_teams,
  public.wc2026_matches,
  public.wc2026_match_live_snapshots,
  public.wc2026_match_events,
  public.wc2026_match_predictions
to anon, authenticated;

commit;

-- Verification queries to run through MCP after commit:
--
-- 1) No remaining public write table grants.
-- select grantee, table_schema, table_name, privilege_type
-- from information_schema.table_privileges
-- where table_schema = 'public'
--   and grantee in ('anon', 'authenticated')
--   and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
-- order by grantee, table_name, privilege_type;
--
-- 2) No public write policies remain on the two known risky tables.
-- select schemaname, tablename, policyname, cmd, roles
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in ('wc2026_matches', 'wc2026_match_events')
--   and (
--     cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
--     or policyname = 'Enable write for public'
--   )
-- order by tablename, policyname;
--
-- 3) Public read policies remain.
-- select schemaname, tablename, policyname, cmd, roles
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in (
--     'wc2026_teams',
--     'wc2026_matches',
--     'wc2026_match_live_snapshots',
--     'wc2026_match_events',
--     'wc2026_match_predictions'
--   )
-- order by tablename, policyname;
