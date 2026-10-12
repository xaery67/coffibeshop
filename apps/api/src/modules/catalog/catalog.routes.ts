import { Router } from 'express';
import { asyncHandler, sendOk, BadRequest, NotFound, ServiceUnavailable } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { multerUpload, handleMulterError } from '../../middleware/upload.js';
import {
  ProductQuery,
  OutletInput,
  CategoryInput,
  CategoryUpdateInput,
  ProductInput,
  ProductUpdateInput,
  VariantInput,
  OptionInput,
  OptionValueInput,
} from '@coffibeshop/shared';
import { CatalogService } from './catalog.service.js';
import { uploadToStorage } from '../../lib/supabase.js';
import { env } from '../../config/env.js';

export const catalogRouter = Router();
const service = new CatalogService();

// ───────────────────────── PUBLIK (read) ─────────────────────────

/** GET /api/v1/catalog/outlets?lat=&lng=&radius= — outlet aktif + jarak. */
catalogRouter.get(
  '/outlets',
  asyncHandler(async (req, res) => sendOk(res, await service.outlets(req.query as any))),
);

/** GET /api/v1/catalog/outlets/:id — detail outlet + jam operasional. */
catalogRouter.get(
  '/outlets/:id',
  asyncHandler(async (req, res) => sendOk(res, await service.outlet(req.params.id))),
);

/** GET /api/v1/catalog/categories?outlet_id= — kategori aktif + jumlah produk. */
catalogRouter.get(
  '/categories',
  asyncHandler(async (req, res) => sendOk(res, await service.categories(req.query.outlet_id as string | undefined))),
);

/** GET /api/v1/catalog/products?outlet_id=&q=&category_id=&available=&page=&limit= */
catalogRouter.get(
  '/products',
  validate(ProductQuery, 'query'),
  asyncHandler(async (req, res) => sendOk(res, await service.listProducts(req.query))),
);

/** GET /api/v1/catalog/menu/:outletId — menu lengkap satu outlet (cache 5m). */
catalogRouter.get(
  '/menu/:outletId',
  asyncHandler(async (req, res) => sendOk(res, await service.menu(req.params.outletId))),
);

/** GET /api/v1/catalog/products/:id — detail + varian + opsi. */
catalogRouter.get(
  '/products/:id',
  asyncHandler(async (req, res) => sendOk(res, await service.product(req.params.id))),
);

// ───────────────────────── ADMIN (tulis) ─────────────────────────

/** POST /api/v1/catalog/outlets — buat outlet (owner). */
catalogRouter.post(
  '/outlets',
  requireAuth,
  requireRole('owner'),
  validate(OutletInput),
  asyncHandler(async (req, res) => sendOk(res, await service.createOutlet(req.body), 201)),
);

/** PUT /api/v1/catalog/outlets/:id — update outlet (owner/manager). */
catalogRouter.put(
  '/outlets/:id',
  requireAuth,
  requireRole('owner', 'manager'),
  validate(OutletInput.partial()),
  asyncHandler(async (req, res) => sendOk(res, await service.updateOutlet(req.params.id, req.body))),
);

/** POST /api/v1/catalog/categories — buat kategori (owner/manager). */
catalogRouter.post(
  '/categories',
  requireAuth,
  requireRole('owner', 'manager'),
  validate(CategoryInput),
  asyncHandler(async (req, res) => sendOk(res, await service.createCategory(req.body), 201)),
);

/** PUT /api/v1/catalog/categories/:id — update kategori (owner/manager). */
catalogRouter.put(
  '/categories/:id',
  requireAuth,
  requireRole('owner', 'manager'),
  validate(CategoryUpdateInput),
  asyncHandler(async (req, res) => sendOk(res, await service.updateCategory(req.params.id, req.body))),
);

/** POST /api/v1/catalog/products — buat produk (owner/manager). */
catalogRouter.post(
  '/products',
  requireAuth,
  requireRole('owner', 'manager'),
  validate(ProductInput),
  asyncHandler(async (req, res) => sendOk(res, await service.createProduct(req.body), 201)),
);

/** PUT /api/v1/catalog/products/:id — update produk (owner/manager). */
catalogRouter.put(
  '/products/:id',
  requireAuth,
  requireRole('owner', 'manager'),
  validate(ProductUpdateInput),
  asyncHandler(async (req, res) => sendOk(res, await service.updateProduct(req.params.id, req.body))),
);

/** DELETE /api/v1/catalog/products/:id — soft delete produk (owner/manager). */
catalogRouter.delete(
  '/products/:id',
  requireAuth,
  requireRole('owner', 'manager'),
  asyncHandler(async (req, res) => sendOk(res, await service.deleteProduct(req.params.id))),
);

/** POST /api/v1/catalog/products/:id/image — upload foto produk (owner/manager). */
catalogRouter.post(
  '/products/:id/image',
  requireAuth,
  requireRole('owner', 'manager'),
  multerUpload.single('image'),
  handleMulterError,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const file = req.file;
    
    if (!file) throw BadRequest('File image wajib diunggah (field: image)');
    
    // Validasi MIME type
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw BadRequest('Format file tidak didukung. Hanya JPEG, PNG, WebP yang diperbolehkan');
    }
    
    // Validasi ukuran file (5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw BadRequest('Ukuran file maksimal 5MB');
    }
    
    // Cek produk ada
    const product = await service.getProductById(id);
    if (!product) throw NotFound('Produk tidak ditemukan');
    
    // Upload ke Supabase Storage (bucket dari env — jangan hardcode)
    const bucket = env.SUPABASE_STORAGE_BUCKET;
    const ext = file.mimetype === 'image/jpeg' ? '.jpg' : 
                file.mimetype === 'image/png' ? '.png' : '.webp';
    const path = `products/${id}/${Date.now()}${ext}`;
    
    const publicUrl = await uploadToStorage(bucket, path, file.buffer, file.mimetype);
    
    if (!publicUrl) {
      throw ServiceUnavailable('Supabase Storage belum dikonfigurasi (set SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY)');
    }
    
    // Update produk dengan image_url baru
    const updated = await service.updateProduct(id, { image_url: publicUrl });
    
    sendOk(res, { 
      product_id: id, 
      image_url: publicUrl,
      product: updated 
    }, 201);
  }),
);

/** POST /api/v1/catalog/products/:id/variants — tambah varian (owner/manager). */
catalogRouter.post(
  '/products/:id/variants',
  requireAuth,
  requireRole('owner', 'manager'),
  validate(VariantInput),
  asyncHandler(async (req, res) => sendOk(res, await service.createVariant(req.params.id, req.body), 201)),
);

/** POST /api/v1/catalog/products/:id/options — tambah opsi (owner/manager). */
catalogRouter.post(
  '/products/:id/options',
  requireAuth,
  requireRole('owner', 'manager'),
  validate(OptionInput),
  asyncHandler(async (req, res) => sendOk(res, await service.createOption(req.params.id, req.body), 201)),
);

/** POST /api/v1/catalog/options/:id/values — tambah nilai opsi (owner/manager). */
catalogRouter.post(
  '/options/:id/values',
  requireAuth,
  requireRole('owner', 'manager'),
  validate(OptionValueInput),
  asyncHandler(async (req, res) => sendOk(res, await service.createOptionValue(req.params.id, req.body), 201)),
);

/** POST /api/v1/catalog/cache/invalidate — invalidasi cache katalog (owner). */
catalogRouter.post(
  '/cache/invalidate',
  requireAuth,
  requireRole('owner'),
  asyncHandler(async (_req, res) => sendOk(res, await service.invalidate())),
);
