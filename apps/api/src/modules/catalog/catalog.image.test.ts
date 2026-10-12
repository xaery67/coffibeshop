import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { startServer, mountApp, type TestServer } from '../../../test/harness.js';
import { catalogRouter } from './catalog.routes.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';

/** State in-memory untuk mock. */
const h = vi.hoisted(() => ({
  products: [] as any[],
  uploadCalls: [] as any[],
  authUser: null as any,
}));

// Mock Prisma
vi.mock('../../config/prisma.js', () => {
  const prisma = {
    product: {
      findUnique: async ({ where }: any) => h.products.find((p) => p.id === where.id) ?? null,
      update: async ({ where, data }: any) => {
        const idx = h.products.findIndex((p) => p.id === where.id);
        if (idx >= 0) {
          h.products[idx] = { ...h.products[idx], ...data };
          return h.products[idx];
        }
        return null;
      },
    },
  };
  return { prisma };
});

// Mock uploadToStorage
vi.mock('../../lib/supabase.js', () => {
  const mockUploadToStorage = vi.fn(async (bucket: string, path: string, buffer: Buffer, mimetype: string) => {
    h.uploadCalls.push({ bucket, path, buffer, mimetype });
    // Return null if not configured, otherwise return mock URL
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return null;
    }
    return `https://example.supabase.co/storage/v1/object/public/${bucket}/${path}`;
  });
  return { uploadToStorage: mockUploadToStorage };
});

// Mock auth middleware untuk test
vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    req.user = h.authUser;
    next();
  },
  requireRole: (...roles: string[]) => (req: any, res: any, next: any) => {
    if (!h.authUser || !roles.includes(h.authUser.role)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Akses ditolak' }, data: null });
    }
    next();
  },
}));

let srv: TestServer;
const productId = '550e8400-e29b-41d4-a716-446655440000';
const mockFileBuffer = Buffer.from('fake-image-data');

beforeAll(async () => {
  const app = await mountApp(
    [{ path: '/api/v1/catalog', router: catalogRouter }],
    [requireAuth, requireRole('owner', 'manager')]
  );
  srv = await startServer(app);
});

afterAll(async () => {
  await srv?.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  h.products = [];
  h.uploadCalls = [];
  h.authUser = { id: 'user-1', role: 'owner', outlet_id: 'outlet-1' };
  
  // Add test product
  h.products.push({
    id: productId,
    name: 'Test Product',
    image_url: null,
    outlet_id: 'outlet-1',
    is_active: true,
  });
});

describe('POST /catalog/products/:id/image', () => {
  it('harus menolak request tanpa file (field image wajib)', async () => {
    h.authUser = { id: 'user-1', role: 'owner', outlet_id: 'outlet-1' };
    
    const res = await srv.request('POST', `/api/v1/catalog/products/${productId}/image`, {
      rawBody: new FormData(), // Empty form data
    });
    const json = res.json;
    
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('BAD_REQUEST');
    expect(json.error.message).toContain('wajib');
  });

  it('harus menolak format file tidak didukung (bukan jpeg/png/webp)', async () => {
    const file = {
      buffer: mockFileBuffer,
      mimetype: 'image/gif',
    };
    
    const formData = new FormData();
    formData.append('image', new Blob([file.buffer], { type: file.mimetype }), 'test.gif');
    
    const res = await srv.request('POST', `/api/v1/catalog/products/${productId}/image`, {
      rawBody: formData,
    });
    const json = res.json;
    
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('BAD_REQUEST');
    expect(json.error.message).toContain('tidak didukung');
  });

  it('harus menolak file melebihi 5MB', async () => {
    const file = {
      buffer: Buffer.alloc(6 * 1024 * 1024), // 6MB
      mimetype: 'image/jpeg',
    };
    
    const formData = new FormData();
    formData.append('image', new Blob([file.buffer], { type: file.mimetype }), 'test.jpg');
    
    const res = await srv.request('POST', `/api/v1/catalog/products/${productId}/image`, {
      rawBody: formData,
    });
    const json = res.json;
    
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('BAD_REQUEST');
    expect(json.error.message).toContain('5MB');
  });

  it('harus return 404 bila produk tidak ditemukan', async () => {
    const file = {
      buffer: mockFileBuffer,
      mimetype: 'image/jpeg',
    };
    
    const notFoundId = '550e8400-e29b-41d4-a716-446655440099';
    const formData = new FormData();
    formData.append('image', new Blob([file.buffer], { type: file.mimetype }), 'test.jpg');
    
    const res = await srv.request('POST', `/api/v1/catalog/products/${notFoundId}/image`, {
      rawBody: formData,
    });
    const json = res.json;
    
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('NOT_FOUND');
  });

  it('harus return 503 bila Supabase Storage belum dikonfigurasi (uploadToStorage return null)', async () => {
    // Ensure env vars are not set
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    const file = {
      buffer: mockFileBuffer,
      mimetype: 'image/jpeg',
    };
    
    const formData = new FormData();
    formData.append('image', new Blob([file.buffer], { type: file.mimetype }), 'test.jpg');
    
    const res = await srv.request('POST', `/api/v1/catalog/products/${productId}/image`, {
      rawBody: formData,
    });
    const json = res.json;
    
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('BAD_REQUEST');
    expect(json.error.message).toContain('belum dikonfigurasi');
  });

  it('harus upload berhasil dan update image_url produk saat Supabase terkonfigurasi', async () => {
    // Set env vars to simulate configured Supabase
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    
    const file = {
      buffer: mockFileBuffer,
      mimetype: 'image/jpeg',
    };
    
    const formData = new FormData();
    formData.append('image', new Blob([file.buffer], { type: file.mimetype }), 'test.jpg');
    
    const res = await srv.request('POST', `/api/v1/catalog/products/${productId}/image`, {
      rawBody: formData,
    });
    const json = res.json;
    
    expect(json.success).toBe(true);
    expect(json.data.product_id).toBe(productId);
    expect(json.data.image_url).toContain('https://example.supabase.co/storage/v1/object/public/product-images/products/');
    expect(json.data.product.image_url).toBe(json.data.image_url);
  });

  it('harus return 403 bila user bukan owner/manager', async () => {
    h.authUser = { id: 'user-2', role: 'staff', outlet_id: 'outlet-1' };
    
    const file = {
      buffer: mockFileBuffer,
      mimetype: 'image/jpeg',
    };
    
    const formData = new FormData();
    formData.append('image', new Blob([file.buffer], { type: file.mimetype }), 'test.jpg');
    
    const res = await srv.request('POST', `/api/v1/catalog/products/${productId}/image`, {
      rawBody: formData,
    });
    const json = res.json;
    
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('FORBIDDEN');
  });
});