import { formatIDR } from '../../lib/reporting.js';

/**
 * SalesChart — grafik batang SVG ringan (tanpa dependensi chart eksternal).
 *
 * PRD-FRONTEND §5.3: komponen berat harus on-demand; grafik dibuat sebagai SVG
 * murni agar bundle admin tetap ramping. Aksesibel: `<title>` + tabel ringkas
 * untuk pembaca layar (data tersedia sebagai teks, bukan hanya visual).
 */
export interface SalesPoint {
  label: string;
  value: number;
}

export function SalesChart({
  points,
  height = 180,
  ariaLabel = 'Grafik penjualan',
}: {
  points: SalesPoint[];
  height?: number;
  ariaLabel?: string;
}) {
  if (points.length === 0) {
    return <p className="text-sm text-text-muted">Belum ada data untuk ditampilkan.</p>;
  }

  const max = Math.max(...points.map((p) => p.value), 1);
  const barGap = 4;
  const barWidth = 100 / points.length;

  return (
    <figure className="space-y-2" data-testid="sales-chart">
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="h-44 w-full"
      >
        {points.map((p, i) => {
          const h = (p.value / max) * (height - 20);
          const x = i * barWidth;
          return (
            <g key={`${p.label}-${i}`}>
              <rect
                x={x + barGap / 2}
                y={height - h}
                width={Math.max(barWidth - barGap, 0.5)}
                height={h}
                rx={1}
                className="fill-brand"
              >
                <title>
                  {p.label}: {formatIDR(p.value)}
                </title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-caption text-text-muted">
        <span>{points[0]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
      <figcaption className="sr-only">
        <table>
          <caption>{ariaLabel}</caption>
          <thead>
            <tr>
              <th scope="col">Periode</th>
              <th scope="col">Nilai</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={`sr-${p.label}`}>
                <td>{p.label}</td>
                <td>{formatIDR(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
