export async function fetchWc2026Matches(env: any): Promise<any[]> {
  const baseUrl = env.WC2026_API_BASE_URL || 'https://api.wc2026api.com';
  const apiKey = env.WC2026_API_KEY;
  if (!apiKey) {
    throw new Error('Missing WC2026_API_KEY environment variable');
  }

  const response = await fetch(`${baseUrl}/matches`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`WC2026 API returned HTTP ${response.status}`);
  }

  return response.json() as Promise<any[]>;
}
