import { useQuery } from '@tanstack/react-query';
import type { ReportPeriod } from '@coffibeshop/shared';
import {
  getDailyReport,
  getDashboardKpi,
  getLowStockAlerts,
  getMonthlyReport,
  getTopProducts,
} from '../lib/admin.js';

/**
 * Hook laporan & dashboard (PRD-BACKEND §2.7/§2.5). Semua query dinonaktifkan
 * bila `outletId` belum dipilih (OutletSwitcher).
 */

export function useDashboardKpi(outletId: string | null, date?: string) {
  return useQuery({
    queryKey: ['admin', 'kpi', outletId, date ?? 'today'],
    queryFn: () => getDashboardKpi(outletId!, date),
    enabled: Boolean(outletId),
    staleTime: 60_000,
  });
}

export function useDailyReport(outletId: string | null, date: string) {
  return useQuery({
    queryKey: ['admin', 'report', 'daily', outletId, date],
    queryFn: () => getDailyReport(outletId!, date),
    enabled: Boolean(outletId && date),
  });
}

export function useMonthlyReport(outletId: string | null, month: number, year: number) {
  return useQuery({
    queryKey: ['admin', 'report', 'monthly', outletId, month, year],
    queryFn: () => getMonthlyReport(outletId!, month, year),
    enabled: Boolean(outletId),
  });
}

export function useTopProducts(outletId: string | null, period: ReportPeriod) {
  return useQuery({
    queryKey: ['admin', 'report', 'top', outletId, period],
    queryFn: () => getTopProducts(outletId!, period),
    enabled: Boolean(outletId),
  });
}

export function useLowStock(outletId: string | null) {
  return useQuery({
    queryKey: ['admin', 'low-stock', outletId],
    queryFn: () => getLowStockAlerts(outletId!),
    enabled: Boolean(outletId),
    staleTime: 60_000,
  });
}
