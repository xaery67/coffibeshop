/**
 * QA Sprint 4 — SECURITY probe live (issue #55 §4.11).
 * Memverifikasi terhadap stack live: RBAC 403, anti-IDOR 403, webhook signature 400.
 *
 * Jalankan: node qa-security-s4.js
 */
const BASE = process.env.QA_BASE_URL || 'http://localhost:4000';
import { createHash } from 'node:crypto';

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name} ${detail}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}

async function api(method, path, { token, body } = {}) {
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function main() {
  console.log('=== QA Sprint 4 — Security probe (live) ===\n');

  // Login owner (staff tertinggi).
  const login = await api('POST', '/api/v1/auth/login', { body: { email: 'owner@coffibeshop.id', password: 'ChangeMe123!' } });
  const ownerToken = login.json.data.access_token;

  // 1) Tanpa token → 401 di endpoint staff Sprint 4.
  console.log('[RBAC — tanpa token → 401]');
  for (const p of ['/api/v1/reports/daily', '/api/v1/reports/kpi', '/api/v1/inventory', '/api/v1/orders/queue']) {
    const r = await api('GET', p);
    check(`GET ${p} tanpa token → 401`, r.status === 401, `(got ${r.status})`);
  }

  // 2) Member/guest token → 403 di endpoint staff.
  console.log('\n[RBAC — member → 403]');
  // Buat member acak lewat register.
  const email = `qa-sec-${Date.now()}@example.com`;
  const reg = await api('POST', '/api/v1/auth/register', {
    body: { email, password: 'Str0ngPass!23', full_name: 'QA Sec', phone: `08${Date.now() % 1000000000}` },
  });
  const memberToken = reg.json?.data?.access_token;
  if (!memberToken) { console.log('  ⚠️  register member gagal:', JSON.stringify(reg.json).slice(0, 200)); }
  else {
    for (const p of ['/api/v1/reports/daily', '/api/v1/inventory', '/api/v1/orders/queue']) {
      const r = await api('GET', p, { token: memberToken });
      check(`GET ${p} member → 403`, r.status === 403, `(got ${r.status})`);
    }
    // Status update staff-only.
    const upd = await api('PUT', '/api/v1/orders/11111111-1111-4111-8111-111111111111/status', { token: memberToken, body: { status: 'PAID' } });
    check('PUT /orders/:id/status member → 403', upd.status === 403, `(got ${upd.status})`);
  }

  // 3) Anti-IDOR: order milik member A diakses member B → 403.
  console.log('\n[ANTI-IDOR — dua member nyata]');
  const mkMember = async (tag) => {
    const em = `qa-${tag}-${Date.now()}@example.com`;
    const r = await api('POST', '/api/v1/auth/register', {
      body: { email: em, password: 'Str0ngPass!23', full_name: `QA ${tag}`, phone: `08${(Date.now() + tag.length) % 1000000000}` },
    });
    return r.json?.data?.access_token;
  };
  const tokenA = await mkMember('a');
  const tokenB = await mkMember('b');
  if (tokenA && tokenB) {
    const cat = await api('GET', '/api/v1/catalog/products?limit=50');
    const prod = (cat.json?.data?.data ?? cat.json?.data ?? [])[0];
    await api('POST', '/api/v1/orders/cart/items', { token: tokenA, body: { product_id: prod.id, quantity: 1 } });
    const co = await api('POST', '/api/v1/orders/checkout', { token: tokenA, body: { fulfillment_type: 'pickup' } });
    const orderA = co.json?.data?.order_id;
    if (orderA) {
      const own = await api('GET', `/api/v1/orders/${orderA}`, { token: tokenA });
      check('member A GET order-nya sendiri → 200', own.status === 200, `(got ${own.status})`);
      const other = await api('GET', `/api/v1/orders/${orderA}`, { token: tokenB });
      check('member B GET order milik A → 403', other.status === 403, `(got ${other.status})`);
      const otherCancel = await api('POST', `/api/v1/orders/${orderA}/cancel`, { token: tokenB, body: { reason: 'idor' } });
      check('member B cancel order milik A → 403', otherCancel.status === 403, `(got ${otherCancel.status})`);
      const otherReorder = await api('POST', `/api/v1/orders/${orderA}/reorder`, { token: tokenB });
      check('member B reorder order milik A → 403', otherReorder.status === 403, `(got ${otherReorder.status})`);
    } else {
      console.log('  ⚠️  checkout member A gagal:', JSON.stringify(co.json).slice(0, 200));
    }
  } else {
    console.log('  ⚠️  gagal buat dua member (register):', tokenA ? 'B gagal' : 'A gagal');
  }
  // Track token salah → 404.
  const track = await api('GET', '/api/v1/orders/track/token-palsu-xyz');
  check('GET /orders/track/:token palsu → 404', track.status === 404, `(got ${track.status})`);

  // 4) Webhook signature Midtrans.
  console.log('\n[WEBHOOK SIGNATURE]');
  const whNoSig = await api('POST', '/api/v1/payments/webhook/midtrans', {
    body: { order_id: 'CS-X', transaction_id: 't1', transaction_status: 'settlement', status_code: '200', gross_amount: '100.00' },
  });
  check('webhook tanpa signature_key → 400', whNoSig.status === 400, `(got ${whNoSig.status})`);

  const whBadSig = await api('POST', '/api/v1/payments/webhook/midtrans', {
    body: { order_id: 'CS-X', transaction_id: 't1', transaction_status: 'settlement', status_code: '200', gross_amount: '100.00', signature_key: 'a'.repeat(128) },
  });
  check('webhook signature invalid → 400', whBadSig.status === 400, `(got ${whBadSig.status})`);

  // Provider tak dikenal → 404.
  const whUnknown = await api('POST', '/api/v1/payments/webhook/tidak-ada', { body: { id: 'x' } });
  check('webhook provider tak dikenal → 404', whUnknown.status === 404, `(got ${whUnknown.status})`);

  console.log(`\n=== HASIL: ${pass} pass / ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
