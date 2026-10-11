import { generateKeyPairSync, createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Pemuatan kunci JWT **RS256** (asimetris) — ADR-005 & PRD-BACKEND §2.1.
 *
 * Urutan resolusi:
 *  1. `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` (PEM inline — untuk produksi/secret manager,
 *     boleh memakai `\n` literal yang di-escape).
 *  2. `JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH` (path ke file `.pem`).
 *  3. Fallback dev/test: file `apps/api/.keys/jwt-{private,public}.pem`.
 *  4. Fallback terakhir (dev/test): generate keypair **ephemeral** di memori.
 *     Cukup untuk CI & unit test, TIDAK boleh dipakai produksi (token tidak
 *     akan valid antar-instance / antar-restart).
 *
 * `kid` (key id) = SHA-256 8 byte pertama dari public key → dipakai di header
 * JWT agar rotasi kunci bisa dilakukan tanpa downtime (klien ambil JWKS).
 */

/** Ubah literal `\n` pada env var menjadi newline asli. */
function normalizePem(value: string): string {
  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
}

function readKey(inline?: string, path?: string, fallbackFile?: string): string | null {
  if (inline && inline.trim().length > 0) return normalizePem(inline.trim());
  const candidates = [path, fallbackFile].filter(Boolean) as string[];
  for (const c of candidates) {
    const abs = resolve(process.cwd(), c);
    if (existsSync(abs)) return readFileSync(abs, 'utf8');
  }
  return null;
}

interface JwtKeys {
  privateKey: string;
  publicKey: string;
  kid: string;
  /** true bila keypair di-generate saat runtime (hanya dev/test). */
  ephemeral: boolean;
}

function build(): JwtKeys {
  const privateKey = readKey(
    env.JWT_PRIVATE_KEY,
    env.JWT_PRIVATE_KEY_PATH,
    '.keys/jwt-private.pem',
  );
  const publicKey = readKey(env.JWT_PUBLIC_KEY, env.JWT_PUBLIC_KEY_PATH, '.keys/jwt-public.pem');

  if (privateKey && publicKey) {
    return { privateKey, publicKey, kid: deriveKid(publicKey), ephemeral: false };
  }

  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Kunci JWT RS256 tidak ditemukan. Set JWT_PRIVATE_KEY/JWT_PUBLIC_KEY ' +
        '(PEM inline) atau *_PATH ke file .pem pada environment produksi.',
    );
  }

  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  logger.warn(
    { kid: deriveKid(pair.publicKey) },
    'JWT RS256: memakai keypair EPHEMERAL (dev/test). Set JWT_PRIVATE_KEY untuk produksi.',
  );
  return {
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    kid: deriveKid(pair.publicKey),
    ephemeral: true,
  };
}

function deriveKid(publicKey: string): string {
  return createHash('sha256').update(publicKey).digest('base64url').slice(0, 16);
}

export const jwtKeys: JwtKeys = build();
