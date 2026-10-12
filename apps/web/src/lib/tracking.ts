/**
 * Tracking order — status kanonik + derivasi timeline (UX-FLOWS §5, ADR-009).
 *
 * 6 langkah utama + terminal CANCELLED. Dipakai `StatusTimeline`, `LiveStatusBanner`,
 * `EtaBadge`. Status TIDAK hanya warna — tiap langkah punya ikon + label (WCAG 1.4.1).
 */

/** Urutan langkah maju (happy path). */
export const TRACKING_STEPS = [
  'PENDING',
  'PAID',
  'CONFIRMED',
  'BEING_PREPARED',
  'READY',
  'COMPLETED',
] as const;

export type TrackingStep = (typeof TRACKING_STEPS)[number];

export const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Menunggu pembayaran',
  PAID: 'Pembayaran diterima',
  CONFIRMED: 'Dikonfirmasi outlet',
  BEING_PREPARED: 'Sedang disiapkan',
  READY: 'Siap diambil',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

export function statusLabel(status?: string | null): string {
  if (!status) return 'Memuat…';
  return STATUS_LABELS[status] ?? status;
}

/** Indeks langkah (0-based); -1 bila CANCELLED / tak dikenal. */
export function statusIndex(status?: string | null): number {
  if (!status) return -1;
  return (TRACKING_STEPS as readonly string[]).indexOf(status);
}

/** Status terminal: tak ada langkah lanjutan. */
export function isTerminal(status?: string | null): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED';
}

export type StepState = 'done' | 'current' | 'upcoming';

export interface TimelineStep {
  key: TrackingStep;
  label: string;
  state: StepState;
}

/**
 * Bangun langkah timeline dari status sekarang.
 * - status sebelum langkah → `done`
 * - langkah aktif → `current`
 * - sesudah → `upcoming`
 * - CANCELLED → semua langkah sebelum pembatalan `done`, sisanya `upcoming`
 *   (status batal ditampilkan terpisah oleh `LiveStatusBanner`).
 */
export function buildTimeline(status?: string | null): TimelineStep[] {
  const idx = statusIndex(status);
  return TRACKING_STEPS.map((key, i) => ({
    key,
    label: STATUS_LABELS[key],
    state: idx < 0 ? 'upcoming' : i < idx ? 'done' : i === idx ? 'current' : 'upcoming',
  }));
}

/** Estimasi siap dalam menit (dibulatkan ke atas); null bila tak ada / sudah lewat. */
export function etaMinutes(estimatedReadyTime?: string | null, now: number = Date.now()): number | null {
  if (!estimatedReadyTime) return null;
  const t = Date.parse(estimatedReadyTime);
  if (Number.isNaN(t)) return null;
  const diff = t - now;
  if (diff <= 0) return 0;
  return Math.ceil(diff / 60_000);
}
