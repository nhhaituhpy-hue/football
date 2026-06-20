export async function getSupabaseRows(env: any, path: string): Promise<any[]> {
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  let supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseKey || supabaseKey.includes('your_')) {
    supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase Worker environment variables');
  }

  const response = await fetch(`${supabaseUrl}${path}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase returned HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<any[]>;
}

export async function upsertSupabaseRows(env: any, path: string, payload: any): Promise<void> {
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase Worker environment variables');
  }

  const response = await fetch(`${supabaseUrl}${path}`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Supabase upsert returned HTTP ${response.status}: ${await response.text()}`);
  }
}

export async function insertSupabaseRow(env: any, path: string, payload: any): Promise<any> {
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase Worker environment variables');
  }

  const response = await fetch(`${supabaseUrl}${path}`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Supabase insert returned HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json() as any[];
  return data && data.length > 0 ? data[0] : null;
}

export async function updateSupabaseRow(env: any, path: string, id: number | string, payload: any): Promise<void> {
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase Worker environment variables');
  }

  const response = await fetch(`${supabaseUrl}${path}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Supabase update returned HTTP ${response.status}: ${await response.text()}`);
  }
}
