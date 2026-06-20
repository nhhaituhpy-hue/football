import { supabase } from '../../lib/supabase';
import { IS_SUPABASE_CONFIGURED } from './config';

export interface SupabaseMatchRow {
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

export async function fetchMatchesFromDb(): Promise<SupabaseMatchRow[]> {
  if (!IS_SUPABASE_CONFIGURED) return [];

  const { data, error } = await supabase
    .from('wc2026_matches')
    .select('*')
    .order('kickoff_utc', { ascending: true });

  if (error) {
    console.warn('Supabase matches fetch failed:', error);
    return [];
  }

  return (data || []) as SupabaseMatchRow[];
}
