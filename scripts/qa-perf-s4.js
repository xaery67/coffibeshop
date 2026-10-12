/**
 * QA Sprint 4 — pengukuran PERFORMANCE & E2E live (issue #55 §4.10/§4.9).
 * Menjalankan alur nyata terhadap stack live di localhost:4000 dan mencetak
 * latensi terukur (ms) untuk tiap tahap. Bukan test vitest — skrip bukti.
 *
 * Jalankan: node qa-perf-s4.mjs
 */
const BASE = process.env.QA_BASE_URL || 'http://localhost:4000';
const WS_BASE = BASE.replace(/^http/, 'ws');

const results = [];
function record(name, ms, extra = '') {
  results.push({ name, ms: Math.round(ms), extra });
  console.log(`  ${name}: ${Math.round(ms)} ms ${extra}`);
}

async function timed(name, fn, extra = '') {
  const t0 = performance.now();
  const out = await fn();
  record(name, performance.now() - t0, extra);
  return out;
}

async function api(method, path, { token, body, guestId } = {}) {
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (guestId) headers['x-guest-id'] = guestId;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function login(email, password) {
  const r = await api('POST', '/api/v1/auth/login', { body: { email, password } });
  if (r.status !== 200) throw new Error(`login ${email} gagal: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.data.access_token;
}

async function main() {
  console.log('=== QA Sprint 4 — E2E + Performance (live stack) ===\n');

  // ── Login owner (seed) ──
  const ownerToken = await login('owner@coffibeshop.id', 'ChangeMe123!');
  console.log('✓ login owner OK');

  // ── Ambil produk Latte + varian Large + opsi Extra Shot ──
  const cat = await api('GET', '/api/v1/catalog/products?limit=50');
  const products = cat.json?.data?.data ?? cat.json?.data ?? [];
  const latte = products.find((p) => p.slug === 'latte') || products[0];
  if (!latte) throw new Error('tidak ada produk di katalog');
  const large = (latte.variants ?? []).find((v) => v.name === 'Large');
  console.log(`✓ produk: ${latte.name} (${latte.id}), varian Large=${large?.id ?? '-'}`);

  // ── GUEST happy path ──
  console.log('\n[GUEST CHECKOUT]');
  const guestId = `qa-guest-${Date.now()}`;
  await timed('add to cart (guest)', () =>
    api('POST', '/api/v1/orders/cart/items', {
      guestId,
      body: { product_id: latte.id, variant_id: large?.id, quantity: 1 },
    }),
  );

  const checkout = await timed('checkout → order PENDING (< 90s target)', () =>
    api('POST', '/api/v1/orders/checkout', {
      guestId,
      body: { fulfillment_type: 'pickup', payment_method: 'qris' },
    }),
  );
  const orderId = checkout.json?.data?.order_id;
  const trackingToken = checkout.json?.data?.tracking_token;
  console.log(`  → order_id=${orderId} status=${checkout.json?.data?.status} total=${checkout.json?.data?.total ?? '-'}`);

  // ── Payment initiate ──
  console.log('\n[PAYMENT INITIATE]');
  const init = await timed('POST /payments/initiate (< 10s target)', () =>
    api('POST', '/api/v1/payments/initiate', {
      guestId,
      body: { order_id: orderId, amount: checkout.json?.data?.total ?? 82140, method: 'qris' },
    }),
  );
  console.log(`  → status=${init.status} provider=${init.json?.data?.provider ?? '-'} has_url=${!!init.json?.data?.paymentUrl}`);

  // ── Staff: status update via owner token (owner = staff) ──
  console.log('\n[STAFF STATUS UPDATE]');
  const paid = await timed('PUT /orders/:id/status PAID (< 5s target)', () =>
    api('PUT', `/api/v1/orders/${orderId}/status`, { token: ownerToken, body: { status: 'PAID' } }),
  );
  console.log(`  → status=${paid.status} new=${paid.json?.data?.status ?? '-'}`);
  await timed('PUT /orders/:id/status CONFIRMED', () =>
    api('PUT', `/api/v1/orders/${orderId}/status`, { token: ownerToken, body: { status: 'CONFIRMED' } }),
  );

  // ── Track publik ──
  console.log('\n[TRACK PUBLIK]');
  const track = await timed('GET /orders/track/:token', () => api('GET', `/api/v1/orders/track/${trackingToken}`));
  console.log(`  → status=${track.status} order_status=${track.json?.data?.status ?? '-'}`);

  // ── Reports (staff) ──
  console.log('\n[REPORTS]');
  const daily = await timed('GET /reports/daily', () => api('GET', '/api/v1/reports/daily', { token: ownerToken }));
  console.log(`  → status=${daily.status} orders=${daily.json?.data?.orders ?? '-'} gross=${daily.json?.data?.gross_revenue ?? '-'}`);
  const kpi = await timed('GET /reports/kpi', () => api('GET', '/api/v1/reports/kpi', { token: ownerToken }));
  console.log(`  → status=${kpi.status}`);

  // ── WS queue ──
  console.log('\n[WS QUEUE]');
  await new Promise((resolve) => {
    const t0 = performance.now();
    const ws = new WebSocket(`${WS_BASE}/api/v1/orders/queue/ws?token=${ownerToken}`);
    const done = (msg) => { record('WS connect + connected event', performance.now() - t0, msg); resolve(); };
    const timer = setTimeout(() => { try { ws.close(); } catch { /* ignore */ } resolve(); }, 8000);
    ws.onmessage = (ev) => {
      clearTimeout(timer);
      const d = JSON.parse(ev.data);
      done(`type=${d.type} role=${d.role ?? '-'}`);
      ws.close();
    };
    ws.onerror = () => { clearTimeout(timer); resolve(); };
  });

  // ── Ringkasan ──
  console.log('\n=== RINGKASAN LATENSI ===');
  const targets = {
    'checkout → order PENDING (< 90s target)': 90000,
    'POST /payments/initiate (< 10s target)': 10000,
    'PUT /orders/:id/status PAID (< 5s target)': 5000,
  };
  let allPass = true;
  for (const r of results) {
    const limit = targets[r.name];
    const verdict = limit ? (r.ms <= limit ? 'PASS' : 'FAIL') : '';
    if (limit && r.ms > limit) allPass = false;
    console.log(`  ${r.ms.toString().padStart(6)} ms  ${verdict.padEnd(5)} ${r.name}`);
  }
  console.log(`\n${allPass ? '✅ SEMUA target perf terpenuhi' : '❌ ada target perf yang gagal'}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
