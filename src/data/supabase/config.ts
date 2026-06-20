export const IS_SUPABASE_CONFIGURED =
  typeof process !== 'undefined' &&
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-supabase-project') &&
  !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.includes('your_');
