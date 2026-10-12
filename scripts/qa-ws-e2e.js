/**
 * QA Sprint 4 — E2E realtime WS fan-out live (issue #55 §4.9 staff queue WS).
 *
 * Skenario: staff (owner) terhubung ke WS queue → customer/guest checkout →
 * staff ubah status → klien WS HARUS menerima event `order:status` dalam < 3s.
 *
 * Jalankan: node qa-ws-e2e.mjs
 */
const BASE = process.env.QA_BASE_URL || 'http://localhost:4000';
const WS_BASE = BASE.replace(/^http/, 'ws');

async function api(method, path, { token, body, guestId } = {}) {
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (guestId) headers['x-guest-id'] = guestId;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function main() {
  const login = await api('POST', '/api/v1/auth/login', { body: { email: 'owner@coffibeshop.id', password: 'ChangeMe123!' } });
  const token = login.json.data.access_token;

  const cat = await api('GET', '/api/v1/catalog/products?limit=50');
  const products = cat.json?.data?.data ?? cat.json?.data ?? [];
  const latte = products.find((p) => p.slug === 'latte') || products[0];

  // 1) Staff connect WS.
  const events = [];
  const ws = new WebSocket(`${WS_BASE}/api/v1/orders/queue/ws?token=${token}`);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS connect timeout')), 8000);
    ws.onmessage = (ev) => {
      const d = JSON.parse(ev.data);
      events.push(d);
      if (d.type === 'connected') { clearTimeout(timer); resolve(); }
    };
    ws.onerror = (e) => { clearTimeout(timer); reject(e); };
  });
  console.log('✓ staff WS terhubung (event connected)');

  // 2) Guest checkout → order PENDING.
  const guestId = `qa-ws-${Date.now()}`;
  await api('POST', '/api/v1/orders/cart/items', { guestId, body: { product_id: latte.id, quantity: 1 } });
  const checkout = await api('POST', '/api/v1/orders/checkout', { guestId, body: { fulfillment_type: 'pickup' } });
  const orderId = checkout.json.data.order_id;
  console.log(`✓ guest checkout → ${orderId}`);

  // 3) Tunggu event 'created' dari fan-out (order:created).
  const waitFor = (type, ms = 6000) =>
    new Promise((resolve) => {
      const t0 = performance.now();
      const iv = setInterval(() => {
        const found = events.find((e) => e.type === type);
        if (found) { clearInterval(iv); resolve({ found, latency: performance.now() - t0 }); }
        else if (performance.now() - t0 > ms) { clearInterval(iv); resolve(null); }
      }, 50);
    });

  const created = await waitFor('created');
  if (created) console.log(`✓ event 'created' diterima (latensi ${Math.round(created.latency)} ms)`);
  else console.log('⚠️  event "created" tidak diterima (cek fan-out order:created)');

  // 4) Staff ubah status → PENDING→PAID → event 'status'.
  const before = performance.now();
  const upd = await api('PUT', `/api/v1/orders/${orderId}/status`, { token, body: { status: 'PAID' } });
  if (upd.status !== 200) throw new Error(`update status gagal: ${upd.status}`);
  const statusEvt = await waitFor('status', 6000);
  const latency = statusEvt ? performance.now() - before : null;

  if (statusEvt) {
    console.log(`✓ event 'status' diterima: ${statusEvt.found.previous_status} → ${statusEvt.found.status} (latensi ${Math.round(latency)} ms)`);
  } else {
    console.log('❌ event "status" TIDAK diterima dalam 6s');
  }

  ws.close();

  const ok = !!statusEvt && latency < 3000;
  console.log(`\n${ok ? '✅ WS fan-out realtime OK (< 3s)' : '❌ WS fan-out realtime GAGAL/lewat 3s'}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
