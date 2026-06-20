import { supabase } from '../../lib/supabase';
import { MatchPrediction } from '../../types';
import { IS_SUPABASE_CONFIGURED } from './config';

export async function fetchPredictionFromDb(matchId: number): Promise<MatchPrediction | null> {
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
