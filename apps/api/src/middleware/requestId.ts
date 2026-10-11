import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';

/** Tambahkan x-request-id untuk korelasi log (DEVOPS §4). */
export const requestId: RequestHandler = (req, res, next) => {
  const id = (req.headers['x-request-id'] as string) || randomUUID();
  (req as any).requestId = id;
  res.setHeader('x-request-id', id);
  next();
};
