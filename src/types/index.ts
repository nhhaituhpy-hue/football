export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';

export interface Team {
  id: number;
  code: string;
  name_en: string;
  name_vi: string;
  group_name: string | null;
  flag_url: string | null;
}

export interface StandingRow {
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

export interface MatchResult {
  match_id: number;
  home_score: number;
  away_score: number;
  status: MatchStatus;
  current_minute: number;
  home_extra_score: number;
  away_extra_score: number;
  home_pen_score: number;
  away_pen_score: number;
  updated_at: string;
  phase?: string | null;
}

export interface Match {
  id: number;
  match_number: number | null;
  round_code: string;
  round: string;
  group_name: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
  home_team_name: string | null;
  away_team_name: string | null;
  home_team_code: string | null;
  away_team_code: string | null;
  match_time: string;
  stadium: string;
  stadium_city: string | null;
  stadium_country: string | null;
  broadcast_channel: string | null;
  home_team?: Team | null;
  away_team?: Team | null;
  result?: MatchResult;
}

export interface MatchEvent {
  id: number | string;
  match_id: number;
  event_type: 'goal' | 'card_yellow' | 'card_red' | 'penalty_shootout' | 'substitution' | 'var' | 'other';
  minute: number;
  player_name: string;
  detail?: string | null;
  is_home_team: boolean;
  created_at?: string;
}

export interface WorkerLiveMatch {
  match_id: number;
  provider_event_id?: string | null;
  status: MatchStatus;
  phase?: string | null;
  clock?: string | null;
  minute?: number | null;
  home_score?: number | null;
  away_score?: number | null;
  home_pen?: number | null;
  away_pen?: number | null;
  events?: MatchEvent[];
  updated_at?: string;
}

export interface WorkerEnvelope<T> {
  data: T;
  cached: boolean;
  updated_at: string;
}
