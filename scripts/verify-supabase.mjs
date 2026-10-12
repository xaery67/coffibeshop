#!/usr/bin/env node
/**
 * Script verifikasi konfigurasi Supabase Storage (Issue #15).
 * 
 * Behavior:
 * - Exit code 2 (SKIP) bila kredensial SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak diset
 * - Exit code 0 bila ping REST + cek bucket + upload/hapus sukses
 * - Exit code 1 bila ada error konfigurasi/koneksi
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Muat .env root (skrip jalan dari mana saja) — jangan timpa env yang sudah ada.
function loadEnvFile() {
  const file = join(ROOT, '.env');
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
loadEnvFile();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'cs-dev-products';

// PNG 1x1 transparan — MIME image/png (bucket membatasi jpeg/png/webp).
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function main() {
  console.log('[verify-supabase] Memulai verifikasi Supabase Storage...');
  
  // Cek kredensial
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log('[verify-supabase] SKIP: SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY tidak diset');
    console.log('[verify-supabase] Set environment variables untuk menjalankan verifikasi penuh');
    process.exit(2); // SKIP
  }
  
  console.log(`[verify-supabase] URL: ${SUPABASE_URL}`);
  console.log(`[verify-supabase] Bucket: ${BUCKET}`);
  
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    
    // 1. Ping REST API (list buckets)
    console.log('[verify-supabase] 1/3 Ping REST API...');
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      throw new Error(`Gagal list buckets: ${listError.message}`);
    }
    
    console.log(`[verify-supabase]   Buckets ditemukan: ${buckets.map(b => b.name).join(', ')}`);
    
    // 2. Cek bucket (dari SUPABASE_STORAGE_BUCKET)
    console.log(`[verify-supabase] 2/3 Cek bucket ${BUCKET}...`);
    const bucketExists = buckets.some(b => b.name === BUCKET);
    
    if (!bucketExists) {
      throw new Error(`Bucket '${BUCKET}' tidak ditemukan. Buat bucket di dashboard Supabase.`);
    }
    
    console.log(`[verify-supabase]   Bucket '${BUCKET}' ada ✓`);
    
    // 3. Upload test file + hapus
    console.log('[verify-supabase] 3/3 Test upload & delete...');
    const testPath = `verify/${Date.now()}.png`;
    
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(testPath, PNG_1X1, {
        contentType: 'image/png',
        upsert: true,
      });
    
    if (uploadError) {
      throw new Error(`Upload gagal: ${uploadError.message}`);
    }
    
    console.log('[verify-supabase]   Upload berhasil ✓');
    
    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(testPath);
    
    console.log(`[verify-supabase]   Public URL: ${publicUrlData.publicUrl}`);
    
    // Delete test file
    const { error: deleteError } = await supabase.storage
      .from(BUCKET)
      .remove([testPath]);
    
    if (deleteError) {
      console.warn(`[verify-supabase]   Warning: Gagal hapus file test: ${deleteError.message}`);
    } else {
      console.log('[verify-supabase]   Delete test file berhasil ✓');
    }
    
    console.log('[verify-supabase] ✅ Semua verifikasi LULUS');
    process.exit(0);
    
  } catch (err) {
    console.error(`[verify-supabase] ❌ GAGAL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();