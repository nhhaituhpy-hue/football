import { makeCorsHeaders } from '../utils';

export async function requireAdmin(request: Request, env: any): Promise<any | Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), {
      status: 401,
      headers: makeCorsHeaders(request),
    });
  }

  const token = authHeader.slice(7);
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return new Response(JSON.stringify({ error: 'Server misconfigured: missing Supabase URL' }), {
      status: 500,
      headers: makeCorsHeaders(request),
    });
  }

  try {
    // Verify token by calling Supabase Auth /auth/v1/user
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      },
    });

    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: makeCorsHeaders(request),
      });
    }

    const user = await userRes.json() as any;
    const role = user.app_metadata?.role;

    if (role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), {
        status: 403,
        headers: makeCorsHeaders(request),
      });
    }

    return user; // success — return user data
  } catch (err: any) {
    console.error('JWT verification failed:', err.message);
    return new Response(JSON.stringify({ error: 'Authentication service error' }), {
      status: 500,
      headers: makeCorsHeaders(request),
    });
  }
}
