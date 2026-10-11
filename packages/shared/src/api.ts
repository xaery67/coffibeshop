import { z } from 'zod';

/** Envelope response standar: { success, data, error } (PRD-BACKEND §4.1) */
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; total_pages: number };
}

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;

export const GuestIdHeader = z.string().uuid();

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data, error: null };
}
export function fail(code: string, message: string, details?: unknown): ApiResponse<never> {
  return { success: false, data: null, error: { code, message, details } };
}
