-- World Cup 2026 fresh Supabase schema.
-- Run this through Supabase MCP execute_sql on project qblkjphwwnrexlhfqoyo.
-- It intentionally removes the old repo tables and recreates the data model
-- around api.wc2026api.com schedule data plus Worker-proxied live snapshots.

begin;

drop table if exists tournament_rules cascade;
drop table if exists match_events cascade;
drop table if exists match_results cascade;
drop table if exists matches cascade;
drop table if exists teams cascade;

drop table if exists wc2026_api_sync_log cascade;
drop table if exists wc2026_match_predictions cascade;
drop table if exists wc2026_match_events cascade;
drop table if exists wc2026_match_live_snapshots cascade;
drop table if exists wc2026_matches cascade;
drop table if exists wc2026_teams cascade;

create table wc2026_teams (
  id integer primary key,
  code text not null unique,
  name_en text not null,
  name_vi text not null,
  group_name text,
  flag_url text,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table wc2026_matches (
  id bigint primary key,
  match_number integer unique,
  round_code text not null,
  round_name text not null,
  group_name text,
  home_team_id integer references wc2026_teams(id) on delete set null,
  away_team_id integer references wc2026_teams(id) on delete set null,
  home_team_name text,
  away_team_name text,
  home_team_code text,
  away_team_code text,
  stadium_id integer,
  stadium_name text,
  stadium_city text,
  stadium_country text,
  kickoff_utc timestamptz not null,
  status text not null default 'scheduled',
  phase text,
  home_score integer,
  away_score integer,
  home_pen integer,
  away_pen integer,
  highlight_url text,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table wc2026_match_live_snapshots (
  match_id bigint primary key references wc2026_matches(id) on delete cascade,
  provider text not null default 'sofascore',
  provider_event_id text,
  status text not null default 'scheduled',
  phase text,
  clock text,
  minute integer,
  home_score integer,
  away_score integer,
  home_pen integer,
  away_pen integer,
  source_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table wc2026_match_events (
  id bigserial primary key,
  match_id bigint not null references wc2026_matches(id) on delete cascade,
  provider text not null default 'sofascore',
  provider_event_id text,
  event_type text not null,
  minute integer,
  minute_text text,
  player_name text,
  team_side text check (team_side in ('home', 'away') or team_side is null),
  detail text,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table wc2026_match_predictions (
  match_id bigint primary key references wc2026_matches(id) on delete cascade,
  source_url text,
  title text,
  sapo text,
  force_info jsonb not null default '{}'::jsonb,
  form_info jsonb not null default '{}'::jsonb,
  prediction_info jsonb not null default '{}'::jsonb,
  media_prediction jsonb not null default '{}'::jsonb,
  full_analysis text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table wc2026_api_sync_log (
  id bigserial primary key,
  source text not null,
  status text not null,
  message text,
  rows_read integer not null default 0,
  rows_written integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index wc2026_matches_kickoff_idx on wc2026_matches (kickoff_utc);
create index wc2026_matches_round_group_idx on wc2026_matches (round_code, group_name);
create index wc2026_matches_status_idx on wc2026_matches (status);
create index wc2026_live_status_idx on wc2026_match_live_snapshots (status, updated_at desc);
create index wc2026_events_match_idx on wc2026_match_events (match_id, minute);
create index wc2026_predictions_updated_idx on wc2026_match_predictions (updated_at desc);

alter table wc2026_teams enable row level security;
alter table wc2026_matches enable row level security;
alter table wc2026_match_live_snapshots enable row level security;
alter table wc2026_match_events enable row level security;
alter table wc2026_match_predictions enable row level security;
alter table wc2026_api_sync_log enable row level security;

create policy "Public read wc2026 teams"
  on wc2026_teams for select
  to anon, authenticated
  using (true);

create policy "Public read wc2026 matches"
  on wc2026_matches for select
  to anon, authenticated
  using (true);

create policy "Public read wc2026 live snapshots"
  on wc2026_match_live_snapshots for select
  to anon, authenticated
  using (true);

create policy "Public read wc2026 match events"
  on wc2026_match_events for select
  to anon, authenticated
  using (true);

create policy "Public read wc2026 match predictions"
  on wc2026_match_predictions for select
  to anon, authenticated
  using (true);

grant usage on schema public to anon, authenticated;

-- Public clients may read fixture data only. All writes must go through trusted
-- server-side paths such as the Cloudflare Worker using the service-role key.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;

grant select on table
  wc2026_teams,
  wc2026_matches,
  wc2026_match_live_snapshots,
  wc2026_match_events,
  wc2026_match_predictions
to anon, authenticated;

commit;
