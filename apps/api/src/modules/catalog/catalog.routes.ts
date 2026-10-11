import { Router } from 'express';
import { asyncHandler, sendOk } from '../../lib/http.js';
import { CatalogService } from './catalog.service.js';

export const catalogRouter = Router();
const service = new CatalogService();

/** GET /api/v1/catalog/categories */
catalogRouter.get('/categories', asyncHandler(async (_req, res) => sendOk(res, await service.categories())));

/** GET /api/v1/catalog/products?outlet_id=&q=&category_id=&page=&limit= */
catalogRouter.get(
  '/products',
  asyncHandler(async (req, res) => sendOk(res, await service.listProducts(req.query))),
);

/** GET /api/v1/catalog/products/:id */
catalogRouter.get(
  '/products/:id',
  asyncHandler(async (req, res) => sendOk(res, await service.product(req.params.id))),
);
