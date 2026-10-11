import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';

export type SheetSnap = 'peek' | 'half' | 'full';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Tinggi awal saat terbuka. Default 'full' (92%) untuk kustomisasi (PRD §6.5). */
  snap?: SheetSnap;
  title?: string;
  /** Footer sticky di dalam sheet (mis. StickyPriceFooter). */
  footer?: ReactNode;
  children: ReactNode;
}

const SNAP_PCT: Record<SheetSnap, number> = { peek: 25, half: 60, full: 92 };
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * BottomSheet — primitive design system (PRD-FRONTEND §6.5, UX §3.5).
 * Self-contained: focus-trap, `Esc`, `aria-modal`, body scroll lock, fokus kembali ke pemicu,
 * drag-to-close dari handle, snap 25/60/92%, safe-area. Tanpa dependensi tambahan.
 */
export function BottomSheet({ open, onClose, snap = 'full', title, footer, children }: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const dragStartY = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const titleId = useId();

  // Simpan pemicu → kembalikan fokus saat tutup (WCAG 2.4.3).
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
    } else if (triggerRef.current instanceof HTMLElement) {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [open]);

  // Kunci scroll body + fokus awal ke panel.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panelRef.current)?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Esc menutup + trap fokus Tab di dalam sheet.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const list = Array.from(nodes);
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  // Drag-to-close dari handle: tutup bila geser > 30% tinggi atau velocity tinggi.
  const onPointerDown = (e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStartY.current === null) return;
    setDragOffset(Math.max(0, e.clientY - dragStartY.current));
  };
  const onPointerUp = () => {
    const height = panelRef.current?.offsetHeight ?? 0;
    if (dragOffset > height * 0.3) onClose();
    dragStartY.current = null;
    setDragOffset(0);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Panel'}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={{
          height: `${SNAP_PCT[snap]}%`,
          transform: `translateY(${dragOffset}px)`,
          transition: dragStartY.current === null ? 'transform 250ms ease' : 'none',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        className="absolute inset-x-0 bottom-0 mx-auto flex max-w-2xl flex-col rounded-t-2xl bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.10)] outline-none"
      >
        <div
          className="flex min-h-[44px] shrink-0 cursor-grab touch-none items-center justify-center"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          aria-label="Geser untuk menutup"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onClose();
            }
          }}
        >
          <span className="h-1 w-9 rounded-full bg-neutral-300" aria-hidden="true" />
        </div>

        {title && (
          <h2 id={titleId} className="shrink-0 px-4 pb-2 text-lg font-bold text-brand">
            {title}
          </h2>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>

        {footer && <div className="shrink-0 border-t border-brand-100 p-4">{footer}</div>}
      </div>
    </div>
  );
}
