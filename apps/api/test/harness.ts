import type { Express, Router } from 'express';
import { createServer, type Server } from 'node:http';

/**
 * Harness HTTP offline untuk test integration (issue #18).
 *
 * Menjalankan app Express di port ephemeral lalu memakai `fetch` bawaan Node —
 * TIDAK menyentuh jaringan eksternal (semua provider diboikot via mock).
 */

export interface TestRequestOptions {
  headers?: Record<string, string>;
  /** Body objek → otomatis di-JSON.stringify + content-type application/json. */
  body?: unknown;
  /** Body mentah (mis. untuk uji signature) — dikirim apa adanya. */
  rawBody?: string;
}

export interface TestResponse {
  status: number;
  headers: Headers;
  /** Body ter-parse; string bila bukan JSON valid. */
  json: any;
}

export interface TestServer {
  baseUrl: string;
  port: number;
  request: (method: string, path: string, opts?: TestRequestOptions) => Promise<TestResponse>;
  close: () => Promise<void>;
}

/** Jalankan app di port acak dan kembalikan helper request/close. */
export async function startServer(app: Express): Promise<TestServer> {
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  const request = async (
    method: string,
    path: string,
    opts: TestRequestOptions = {},
  ): Promise<TestResponse> => {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    let body: string | undefined;
    if (opts.rawBody !== undefined) {
      body = opts.rawBody;
    } else if (opts.body !== undefined) {
      body = JSON.stringify(opts.body);
      if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
        headers['content-type'] = 'application/json';
      }
    }
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body });
    const text = await res.text();
    let json: any = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }
    }
    return { status: res.status, headers: res.headers, json };
  };

  const close = () =>
    new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));

  return { baseUrl, port, request, close };
}

/** Bangun app minimal dari daftar router (tanpa app produksi penuh). */
export async function mountApp(
  mounts: { path: string; router: Router }[],
  middlewares: any[] = [],
): Promise<Express> {
  const express = (await import('express')).default;
  const { errorHandler } = await import('../src/lib/http.js');
  const app = express();
  app.use(express.json());
  for (const mw of middlewares) app.use(mw);
  for (const m of mounts) app.use(m.path, m.router);
  app.use(errorHandler);
  return app;
}

/** Assert bentuk envelope sukses `{ success, data, error }`. */
export function expectOk(body: any) {
  if (!body || body.success !== true || body.error !== null) {
    throw new Error(`Bukan envelope sukses: ${JSON.stringify(body)}`);
  }
  return body.data;
}

/** Assert bentuk envelope error dan kembalikan `error`. */
export function expectError(body: any) {
  if (!body || body.success !== false || !body.error) {
    throw new Error(`Bukan envelope error: ${JSON.stringify(body)}`);
  }
  return body.error as { code: string; message: string; details?: unknown };
}
