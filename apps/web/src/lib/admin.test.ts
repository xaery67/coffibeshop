import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getOrderQueue,
  updateOrderStatus,
  getDashboardKpi,
  getDailyReport,
  getMonthlyReport,
  getTopProducts,
  getLowStockAlerts,
  printTicket,
  normalizeQueueOrder,
} from './admin.js';

/**
 * Klien Admin — **API NYATA** (issue #68).
 *
 * Regresi yang dijaga: modul ini TIDAK boleh punya jalur mock. Test meng-assert
 * setiap fungsi benar-benar memanggil `fetch` dengan URL + method yang benar
 * (bukan delay/toast palsu). `VITE_ADMIN_MOCK` sudah dihapus dari kode.
 */

interface Call {
  url: string;
  method: string;
  body?: unknown;
}

/** Stub fetch yang mencatat panggilan dan mengembalikan payload per-URL. */
function routingFetch(resolve: (url: string) => unknown) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: (init?.method ?? 'GET').toUpperCase(), body: init?.body });
    const payload = resolve(url);
    if (payload instanceof Blob) {
      return { ok: true, status: 200, blob: async () => payload } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: payload, error: null }),
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

beforeEach(() => {
  localStorage.clear();
  // jsdom tidak mengimplementasikan object URL.
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:mock');
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
});

afterEach(() => vi.restoreAllMocks());

describe('admin client → request jaringan nyata', () => {
  it('getOrderQueue memanggil GET /orders/queue?outlet_id=', async () => {
    const calls = routingFetch(() => []);
    await getOrderQueue('o1');
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toContain('/orders/queue');
    expect(calls[0].url).toContain('outlet_id=o1');
  });

  it('getOrderQueue menyertakan filter status bila diberikan', async () => {
    const calls = routingFetch(() => []);
    await getOrderQueue('o1', ['PAID', 'CONFIRMED']);
    expect(calls[0].url).toContain('status=PAID%2CCONFIRMED');
  });

  it('updateOrderStatus memanggil PUT /orders/{id}/status dengan body JSON', async () => {
    const calls = routingFetch(() => ({ id: 'ord-1', status: 'CONFIRMED' }));
    await updateOrderStatus('ord-1', 'CONFIRMED');
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].url).toContain('/orders/ord-1/status');
    expect(JSON.parse(String(calls[0].body))).toEqual({ status: 'CONFIRMED' });
  });

  it('getDashboardKpi memanggil GET /reports/kpi', async () => {
    const calls = routingFetch(() => ({ outlet_id: 'o1' }));
    await getDashboardKpi('o1');
    expect(calls[0].url).toContain('/reports/kpi');
    expect(calls[0].url).toContain('outlet_id=o1');
  });

  it('getDailyReport / getMonthlyReport / getTopProducts → /reports/*', async () => {
    const calls = routingFetch(() => ({}));
    await getDailyReport('o1', '2026-10-13');
    await getMonthlyReport('o1', 10, 2026);
    await getTopProducts('o1', '30d');
    expect(calls[0].url).toContain('/reports/daily');
    expect(calls[0].url).toContain('date=2026-10-13');
    expect(calls[1].url).toContain('/reports/monthly');
    expect(calls[1].url).toContain('month=10');
    expect(calls[1].url).toContain('year=2026');
    expect(calls[2].url).toContain('/reports/top-products');
    expect(calls[2].url).toContain('period=30d');
  });

  it('getLowStockAlerts memanggil GET /inventory/alerts', async () => {
    const calls = routingFetch(() => []);
    await getLowStockAlerts('o1');
    expect(calls[0].url).toContain('/inventory/alerts');
    expect(calls[0].url).toContain('outlet_id=o1');
  });

  it('printTicket memanggil POST /orders/{id}/print-ticket dan mengunduh PDF', async () => {
    const calls = routingFetch(() => new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
    await printTicket('ord-1');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toContain('/orders/ord-1/print-ticket');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});

describe('normalizeQueueOrder — bentuk Prisma backend → DTO', () => {
  it('mengubah Decimal string → number & mengambil nama dari product.name', async () => {
    const raw = {
      id: 'o1',
      order_number: 'CS-1',
      status: 'PAID',
      outlet_id: 'x',
      fulfillment_type: 'pickup',
      total: '59940',
      created_at: '2026-10-13T12:00:00.000Z',
      items: [{ id: 'i1', qty: 2, unit_price: '27000', line_total: '54000', product: { name: 'Latte' }, options: [{ name: 'Extra Shot' }] }],
    };
    const dto = normalizeQueueOrder(raw as never);
    expect(dto.total).toBe(59940);
    expect(dto.items[0].line_total).toBe(54000);
    expect(dto.items[0].unit_price).toBe(27000);
    expect(dto.items[0].product_name).toBe('Latte');
    expect(dto.items[0].options).toEqual(['Extra Shot']);
  });
});
