import { createClient } from '@supabase/supabase-js';

/**
 * Supabase client (browser) — HANYA anon key, aman dipublikasikan.
 * Dipakai untuk Auth & Realtime opsional. Operasi server-side via API.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;
