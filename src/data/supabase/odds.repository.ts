import { supabase } from '../../lib/supabase';
import { MatchOdds } from '../../types';
import { IS_SUPABASE_CONFIGURED } from './config';

export async function fetchOddsFromDb(matchId: number): Promise<MatchOdds | null> {
  if (!IS_SUPABASE_CONFIGURED) return null;

  const { data, error } = await supabase
    .from('wc2026_match_odds')
    .select('*')
    .eq('match_id', matchId)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.warn('Supabase fetchOddsFromDb failed:', error);
    }
    return null;
  }

  return data as MatchOdds;
}
