import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ReportingService (F-014, TC-F014-*) — agregasi harian/bulanan/top-products/KPI.
 *
 * Prisma dimock: kami menyuplai baris order/item deterministik lalu meng-assert
 * angka agregat yang DIHITUNG ULANG secara manual (bukan sekadar memanggil fungsi).
 */

const h = vi.hoisted(() => ({
  orders: [] as unknown[],
  orderItems: [] as unknown[],
  stockRows: [] as unknown[],
}));

vi.mock('../../config/prisma.js', () => ({
  prisma: {
    order: {
      findMany: vi.fn(async () => h.orders),
    },
    orderItem: {
      findMany: vi.fn(async () => h.orderItems),
    },
    inventoryItem: {
      findMany: vi.fn(async () => h.stockRows),
    },
  },
}));

const { ReportingService } = await import('./reporting.service.js');

const svc = new ReportingService();

/** Order ringkas untuk mock. */
function order(o: Partial<Record<string, unknown>>) {
  return {
    id: o.id ?? 'o1',
    total: o.total ?? 100000,
    tax: o.tax ?? 11000,
    discount: o.discount ?? 0,
    points_discount: o.points_discount ?? 0,
    created_at: o.created_at ?? new Date('2026-10-13T10:00:00+07:00'),
    items: o.items ?? [],
  };
}

beforeEach(async () => {
  h.orders = [];
  h.orderItems = [];
  h.stockRows = [];
  // Kembalikan implementasi default (mockImplementation di satu test bisa bocor).
  const prismaMod = await import('../../config/prisma.js');
  (prismaMod.prisma.order.findMany as ReturnType<typeof vi.fn>).mockImplementation(async () => h.orders);
});

describe('ReportingService.getDailyReport (TC-F014)', () => {
  it('menjumlahkan gross, tax, net, items & avg ticket dari order hari itu', async () => {
    h.orders = [
      order({
        total: 100000,
        tax: 11000,
        items: [
          { product_id: 'p1', qty: 2, line_total: 80000, product: { name: 'Latte' } },
          { product_id: 'p2', qty: 1, line_total: 20000, product: { name: 'Croissant' } },
        ],
      }),
      order({
        total: 50000,
        tax: 5500,
        items: [{ product_id: 'p1', qty: 1, line_total: 50000, product: { name: 'Latte' } }],
      }),
    ];

    const r = await svc.getDailyReport('outlet-1', '2026-10-13');

    expect(r.orders).toBe(2);
    expect(r.gross_revenue).toBe(150000);
    expect(r.tax_total).toBe(16500);
    expect(r.net_revenue).toBe(133500);
    expect(r.items_sold).toBe(4);
    expect(r.avg_ticket).toBe(75000);
    expect(r.outlet_id).toBe('outlet-1');
    expect(r.date).toBe('2026-10-13');
  });

  it('top_products diurut qty menurun dan dihitung dari line_total', async () => {
    h.orders = [
      order({
        items: [
          { product_id: 'p1', qty: 3, line_total: 90000, product: { name: 'Latte' } },
          { product_id: 'p2', qty: 7, line_total: 35000, product: { name: 'Kopi Susu' } },
        ],
      }),
    ];
    const r = await svc.getDailyReport('o1', '2026-10-13');
    expect(r.top_products[0]).toMatchObject({ product_id: 'p2', qty_sold: 7, name: 'Kopi Susu' });
    expect(r.top_products[1]).toMatchObject({ product_id: 'p1', qty_sold: 3 });
  });

  it('hari tanpa order → semua nol (tidak NaN)', async () => {
    const r = await svc.getDailyReport('o1', '2026-10-13');
    expect(r.orders).toBe(0);
    expect(r.gross_revenue).toBe(0);
    expect(r.avg_ticket).toBe(0);
    expect(r.items_sold).toBe(0);
  });
});

describe('ReportingService.getTopProducts (TC-F014)', () => {
  it('mengagregasi qty & revenue per produk, urut revenue menurun', async () => {
    h.orderItems = [
      { product_id: 'p1', qty: 2, line_total: 60000, product: { name: 'Latte' } },
      { product_id: 'p1', qty: 1, line_total: 30000, product: { name: 'Latte' } },
      { product_id: 'p2', qty: 5, line_total: 100000, product: { name: 'Americano' } },
    ];
    const r = await svc.getTopProducts('o1', '7d');
    expect(r.period).toBe('7d');
    expect(r.products[0]).toMatchObject({ product_id: 'p2', qty_sold: 5, revenue: 100000 });
    expect(r.products[1]).toMatchObject({ product_id: 'p1', qty_sold: 3, revenue: 90000 });
  });
});

describe('ReportingService.getKpi (dashboard)', () => {
  it('menghitung revenue/order hari ini + delta vs kemarin', async () => {
    // findMany dipanggil 2x: hari ini lalu kemarin — mock mengembalikan berdasarkan urutan.
    let call = 0;
    const prismaMod = await import('../../config/prisma.js');
    (prismaMod.prisma.order.findMany as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      call += 1;
      return call === 1
        ? [{ total: 200000 }, { total: 100000 }]
        : [{ total: 150000 }];
    });

    const r = await svc.getKpi('o1', '2026-10-13');
    // Pulihkan agar test berikutnya tidak terpengaruh.
    const prismaMod2 = await import('../../config/prisma.js');
    (prismaMod2.prisma.order.findMany as ReturnType<typeof vi.fn>).mockImplementation(async () => h.orders);
    expect(r.revenue_today).toBe(300000);
    expect(r.orders_today).toBe(2);
    expect(r.avg_ticket).toBe(150000);
    expect(r.revenue_delta_pct).toBe(100); // 300k vs 150k = +100%
    expect(r.orders_delta_pct).toBe(100); // 2 vs 1 = +100%
  });

  it('low_stock_count dihitung dari quantity <= min_stock', async () => {
    h.stockRows = [
      { quantity: 5, min_stock: 10 },  // low
      { quantity: 20, min_stock: 10 }, // aman
      { quantity: 10, min_stock: 10 }, // low (batas)
    ];
    const r = await svc.getKpi('o1', '2026-10-13');
    expect(r.low_stock_count).toBe(2);
  });
});

describe('ReportingService.exportAccountingCsv', () => {
  it('menghasilkan CSV dengan header + 1 baris per order', async () => {
    h.orders = [
      {
        order_number: 'CS-001',
        created_at: new Date('2026-10-13T10:00:00Z'),
        // total/subtotal dipakai .toFixed → angka
        __ok: true,
        total: 111000,
        subtotal: 100000,
        tax: 11000,
        discount: 0,
        points_discount: 0,
        fulfillment_type: 'pickup',
        payment_method: 'qris',
        outlet_id: 'o1',
      },
    ];
    const { filename, content } = await svc.exportAccountingCsv('o1', 2026, 10);
    expect(filename).toBe('accounting-2026-10.csv');
    const lines = content.split('\n');
    expect(lines[0]).toContain('order_number');
    expect(lines[0]).toContain('total');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('CS-001');
    expect(lines[1]).toContain('111000.00');
  });
});
