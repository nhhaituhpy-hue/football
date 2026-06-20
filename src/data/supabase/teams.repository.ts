import { supabase } from '../../lib/supabase';
import { Team } from '../../types';
import { IS_SUPABASE_CONFIGURED } from './config';

export async function fetchTeamsFromDb(): Promise<Team[]> {
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
