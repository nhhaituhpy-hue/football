import { supabase } from './supabase';
import { Match, MatchEvent, MatchResult, MatchStatus, Team, WorkerEnvelope, WorkerLiveMatch, StandingRow, MatchPrediction } from '../types';

const WORKER_API_BASE_URL = process.env.NEXT_PUBLIC_WORKER_API_BASE_URL || '';

const IS_SUPABASE_CONFIGURED =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-supabase-project') &&
  !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.includes('your_');

const ROUND_LABELS: Record<string, string> = {
  group: 'Vòng bảng',
  R32: 'Vòng 32 đội',
  R16: 'Vòng 16 đội',
  QF: 'Tứ kết',
  SF: 'Bán kết',
  '3rd': 'Tranh hạng ba',
  final: 'Chung kết',
};

interface SupabaseMatchRow {
  id: number;
  match_number: number | null;
  round_code: string;
  round_name: string | null;
  group_name: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
  home_team_name: string | null;
  away_team_name: string | null;
  home_team_code: string | null;
  away_team_code: string | null;
  stadium_name: string | null;
  stadium_city: string | null;
  stadium_country: string | null;
  kickoff_utc: string;
  status: string | null;
  phase: string | null;
  home_score: number | null;
  away_score: number | null;
  home_pen: number | null;
  away_pen: number | null;
  updated_at: string | null;
  highlight_url: string | null;
}

interface SupabaseMatchEventRow {
  id: number;
  match_id: number;
  event_type: MatchEvent['event_type'] | null;
  minute: number | null;
  player_name: string | null;
  detail: string | null;
  team_side: 'home' | 'away' | null;
  created_at: string;
}

function normalizeStatus(status?: string | null): MatchStatus {
  if (status === 'live' || status === 'in_progress') return 'live';
  if (status === 'completed' || status === 'finished' || status === 'FT') return 'finished';
  if (status === 'postponed') return 'postponed';
  if (status === 'cancelled') return 'cancelled';
  return 'scheduled';
}

function resultFromMatch(row: SupabaseMatchRow, live?: WorkerLiveMatch): MatchResult {
  const status = normalizeStatus(live?.status || row.status);
  const phase = live?.phase || row.phase || null;

  return {
    match_id: Number(row.id),
    home_score: live?.home_score ?? row.home_score ?? 0,
    away_score: live?.away_score ?? row.away_score ?? 0,
    status,
    current_minute: live?.minute ?? (status === 'finished' ? 90 : 0),
    home_extra_score: 0,
    away_extra_score: 0,
    home_pen_score: live?.home_pen ?? row.home_pen ?? 0,
    away_pen_score: live?.away_pen ?? row.away_pen ?? 0,
    updated_at: live?.updated_at || row.updated_at || new Date().toISOString(),
    phase,
  };
}

function mapMatch(row: SupabaseMatchRow, teamsById: Map<number, Team>, live?: WorkerLiveMatch): Match {
  const homeTeam = row.home_team_id ? teamsById.get(Number(row.home_team_id)) : null;
  const awayTeam = row.away_team_id ? teamsById.get(Number(row.away_team_id)) : null;

  return {
    id: Number(row.id),
    match_number: row.match_number ?? null,
    round_code: row.round_code,
    round: row.round_name || ROUND_LABELS[row.round_code] || row.round_code,
    group_name: row.group_name ?? null,
    home_team_id: row.home_team_id ?? null,
    away_team_id: row.away_team_id ?? null,
    home_team_name: row.home_team_name,
    away_team_name: row.away_team_name,
    home_team_code: row.home_team_code,
    away_team_code: row.away_team_code,
    match_time: row.kickoff_utc,
    stadium: [row.stadium_name, row.stadium_city, row.stadium_country].filter(Boolean).join(', '),
    stadium_city: row.stadium_city ?? null,
    stadium_country: row.stadium_country ?? null,
    broadcast_channel: null,
    home_team: homeTeam || null,
    away_team: awayTeam || null,
    result: resultFromMatch(row, live),
    events: live?.events || undefined,
    highlight_url: (row as SupabaseMatchRow & { highlight_url?: string | null }).highlight_url || null,
  };
}

async function fetchWorkerJson<T>(path: string): Promise<T | null> {
  if (!WORKER_API_BASE_URL) return null;

  try {
    const response = await fetch(`${WORKER_API_BASE_URL}${path}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Worker returned HTTP ${response.status}`);
    const envelope = (await response.json()) as WorkerEnvelope<T> | T;
    return envelope && typeof envelope === 'object' && 'data' in envelope ? (envelope as WorkerEnvelope<T>).data : (envelope as T);
  } catch (error) {
    console.warn(`Worker fetch failed for ${path}:`, error);
    return null;
  }
}

export async function fetchLiveMatches(force = false): Promise<WorkerLiveMatch[]> {
  if (typeof window === 'undefined' || process.env.NEXT_PHASE === 'phase-production-build') {
    return [];
  }
  return (await fetchWorkerJson<WorkerLiveMatch[]>(force ? '/live?force=true' : '/live')) || [];
}

export async function fetchTeams(): Promise<Team[]> {
  if (!IS_SUPABASE_CONFIGURED) return [];

  const { data, error } = await supabase
    .from('wc2026_teams')
    .select('id, code, name_en, name_vi, group_name, flag_url')
    .order('group_name', { ascending: true })
    .order('name_en', { ascending: true });

  if (error) {
    console.warn('Supabase teams fetch failed:', error);
    return [];
  }

  return (data || []) as Team[];
}

export async function fetchMatches(force = false): Promise<Match[]> {
  if (!IS_SUPABASE_CONFIGURED) return [];

  const [teams, liveMatches] = await Promise.all([
    fetchTeams(),
    fetchLiveMatches(force),
  ]);

  const liveByMatchId = new Map(liveMatches.map((live) => [Number(live.match_id), live]));
  const teamsById = new Map(teams.map((team) => [Number(team.id), team]));

  const { data, error } = await supabase
    .from('wc2026_matches')
    .select('*')
    .order('kickoff_utc', { ascending: true });

  if (error) {
    console.warn('Supabase matches fetch failed:', error);
    return [];
  }

  return ((data || []) as SupabaseMatchRow[]).map((row) => mapMatch(row, teamsById, liveByMatchId.get(Number(row.id))));
}

export async function fetchMatchEvents(matchId: number): Promise<MatchEvent[]> {
  const liveMatches = await fetchLiveMatches();
  const live = liveMatches.find((match) => Number(match.match_id) === Number(matchId));
  if (live?.events?.length) return live.events;

  if (!IS_SUPABASE_CONFIGURED) return [];

  const { data, error } = await supabase
    .from('wc2026_match_events')
    .select('*')
    .eq('match_id', matchId)
    .order('minute', { ascending: true });

  if (error) {
    console.warn('Supabase match events fetch failed:', error);
    return [];
  }

  return ((data || []) as SupabaseMatchEventRow[]).map((event) => ({
    id: event.id,
    match_id: Number(event.match_id),
    event_type: event.event_type || 'other',
    minute: event.minute || 0,
    player_name: event.player_name || '',
    detail: event.detail,
    is_home_team: event.team_side !== 'away',
    created_at: event.created_at,
  }));
}

export async function fetchMatchPrediction(matchId: number): Promise<MatchPrediction | null> {
  if (!IS_SUPABASE_CONFIGURED) return null;

  const { data, error } = await supabase
    .from('wc2026_match_predictions')
    .select('*')
    .eq('match_id', matchId)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.warn('Supabase fetchMatchPrediction failed:', error);
    }
    return null;
  }

  return data as MatchPrediction;
}

export function subscribeMatches(callback: () => void) {
  const interval = window.setInterval(callback, 15000);
  return () => window.clearInterval(interval);
}

export async function fetchTournamentRules() {
  return [];
}

export function calculateStandings(matches: Match[], teams: Team[]): Record<string, StandingRow[]> {
  const temp: Record<string, Record<number, StandingRow>> = {};

  teams.forEach((team) => {
    if (!team.group_name) return;
    temp[team.group_name] ||= {};
    temp[team.group_name][team.id] = {
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
  });

  matches.forEach((match) => {
    if (match.round_code !== 'group') return;
    if (!match.home_team_id || !match.away_team_id || !match.home_team?.group_name || !match.away_team?.group_name) return;
    if (!match.result || match.result.status === 'scheduled') return;

    const home = temp[match.home_team.group_name]?.[match.home_team_id];
    const away = temp[match.away_team.group_name]?.[match.away_team_id];
    if (!home || !away) return;

    const homeScore = match.result.home_score;
    const awayScore = match.result.away_score;

    home.played += 1;
    away.played += 1;
    home.gf += homeScore;
    home.ga += awayScore;
    away.gf += awayScore;
    away.ga += homeScore;

    if (homeScore > awayScore) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
    } else if (homeScore < awayScore) {
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
  });

  return Object.fromEntries(
    Object.entries(temp).map(([group, rows]) => [
      group,
      Object.values(rows).sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf),
    ]),
  );
}
