import { supabase } from '../../lib/supabase';
import { MatchEvent } from '../../types';
import { IS_SUPABASE_CONFIGURED } from './config';

export interface SupabaseMatchEventRow {
  id: number;
  match_id: number;
  event_type: MatchEvent['event_type'] | null;
  minute: number | null;
  player_name: string | null;
  detail: string | null;
  team_side: 'home' | 'away' | null;
  created_at: string;
}

export async function fetchEventsFromDb(matchId: number): Promise<MatchEvent[]> {
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
