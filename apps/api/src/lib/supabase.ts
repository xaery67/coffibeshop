import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Supabase client (service-role) untuk operasi server-side:
 * Storage (foto produk), Auth admin, Realtime opsional.
 * JANGAN pernah pakai service-role key di sisi klien.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    logger.warn('Supabase belum dikonfigurasi — set SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY');
    return null;
  }
  client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Node 20 di container belum punya WebSocket native — supaya-js butuh
    // implementasi eksplisit (kalau tidak: "native WebSocket not found").
    realtime: { transport: WebSocket as never },
  });
  return client;
}

/** Upload file ke bucket Storage; kembalikan URL publik. */
export async function uploadToStorage(
  bucket: string,
  path: string,
  file: Buffer,
  contentType: string,
): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType, upsert: true });
  if (error) throw new Error(`Supabase upload gagal: ${error.message}`);
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
