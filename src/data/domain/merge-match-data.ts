import { Match, MatchResult, MatchStatus, Team, WorkerLiveMatch } from '../../types';
import { SupabaseMatchRow } from '../supabase/matches.repository';

const ROUND_LABELS: Record<string, string> = {
  group: 'Vòng bảng',
  R32: 'Vòng 32 đội',
  R16: 'Vòng 16 đội',
  QF: 'Tứ kết',
  SF: 'Bán kết',
  '3rd': 'Tranh hạng ba',
  final: 'Chung kết',
};

export function normalizeStatus(status?: string | null): MatchStatus {
  if (status === 'live' || status === 'in_progress') return 'live';
  if (status === 'completed' || status === 'finished' || status === 'FT') return 'finished';
  if (status === 'postponed') return 'postponed';
  if (status === 'cancelled') return 'cancelled';
  return 'scheduled';
}

export function resultFromMatch(row: SupabaseMatchRow, live?: WorkerLiveMatch): MatchResult {
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
    red_cards: live?.red_cards || null,
    yellow_cards: live?.yellow_cards || null,
  };
}

export function mergeMatchData(row: SupabaseMatchRow, teamsById: Map<number, Team>, live?: WorkerLiveMatch): Match {
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
    highlight_url: row.highlight_url || null,
  };
}
