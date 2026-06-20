-- Migration: Create wc2026_match_odds table
-- Description: Stores match odds from Odds-API.io (like moneyline, spreads, totals, double chance) mapped to matches.

create table if not exists public.wc2026_match_odds (
  match_id bigint primary key references public.wc2026_matches(id) on delete cascade,
  bookmaker text not null default 'Bet365',
  odds_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable Row Level Security (RLS)
alter table public.wc2026_match_odds enable row level security;

-- Create policy to allow public select
create policy "Public read wc2026 match odds"
  on public.wc2026_match_odds for select
  to anon, authenticated
  using (true);

-- Grant select permission
grant select on table public.wc2026_match_odds to anon, authenticated;
