/**
 * OutletSwitcher — pemilih outlet aktif di Topbar admin (PRD-FRONTEND §2.4).
 *
 * Owner/manager/finance dapat berpindah outlet; kasir/barista terkunci ke
 * outlet miliknya (`locked`), ditampilkan sebagai teks statis (bukan select).
 */
export function OutletSwitcher({
  outlets,
  value,
  onChange,
  locked = false,
}: {
  outlets: { id: string; name: string }[];
  value: string | null;
  onChange: (id: string) => void;
  locked?: boolean;
}) {
  if (locked) {
    const name = outlets.find((o) => o.id === value)?.name ?? 'Outlet Anda';
    return (
      <span
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-brand-50 px-3 text-sm text-text"
        data-testid="outlet-switcher-locked"
        aria-label={`Outlet terkunci: ${name}`}
      >
        <span aria-hidden="true">📍</span>
        {name}
      </span>
    );
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="sr-only">Pilih outlet</span>
      <span aria-hidden="true">📍</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[44px] rounded-lg border border-border bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
        data-testid="outlet-switcher"
      >
        {outlets.length === 0 && <option value="">Memuat outlet…</option>}
        {outlets.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
