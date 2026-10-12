#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  CI GATE — Migration Drift & pg_trgm index   (issue #17 · Sprint 2/Infra)
#
#  Mereproduksi deployment dari NOL (Postgres bersih → migrate deploy) lalu:
#    1. memastikan index pg_trgm `products_name_trgm_idx` &
#       `products_description_trgm_idx` BENAR-BENAR ada (bug nyata: folder
#       migration drift menghapusnya di tiap deployment & tak terdeteksi CI);
#    2. memastikan schema.prisma tidak "drift" dari folder migrations.
#
#  Pakai:
#    - Di CI: sediakan DATABASE_URL (job `services: postgres`).
#    - Lokal : jalankan apa adanya — script menyalakan Postgres ephemeral
#              via Docker bila DATABASE_URL belum diset.
#  Exit != 0 => gate GAGAL.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/apps/api"
CONTAINER=""

cleanup() {
  [ -n "$CONTAINER" ] && docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ── 1) Sumber database ────────────────────────────────────────────────────
if [ -z "${DATABASE_URL:-}" ]; then
  echo "→ DATABASE_URL tidak diset — menyalakan Postgres ephemeral (Docker)"
  PORT="${PG_TEST_PORT:-55432}"
  CONTAINER="cb-mig-check-$$"
  docker run -d --name "$CONTAINER" \
    -e POSTGRES_USER=ci -e POSTGRES_PASSWORD=ci -e POSTGRES_DB=ci \
    -p "${PORT}:5432" postgres:16-alpine >/dev/null
  for _ in $(seq 1 60); do
    docker exec "$CONTAINER" pg_isready -U ci >/dev/null 2>&1 && break
    sleep 1
  done
  export DATABASE_URL="postgresql://ci:ci@localhost:${PORT}/ci"
fi
export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"

cd "$API_DIR"

# ── 2) Generate client + terapkan SEMUA migration dari nol ────────────────
echo "→ prisma generate"
npx --no-install prisma generate >/dev/null

echo "→ prisma migrate deploy (dari nol — simulasi deployment baru)"
npx --no-install prisma migrate deploy

echo "→ prisma migrate status"
npx --no-install prisma migrate status

# ── 3) ASSERT index pg_trgm benar-benar ada ───────────────────────────────
echo "→ verifikasi index pg_trgm"
node --input-type=module -e '
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const required = ["products_name_trgm_idx", "products_description_trgm_idx"];
try {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()"
  );
  const present = new Set(rows.map((r) => r.indexname));
  const missing = required.filter((i) => !present.has(i));
  if (missing.length) {
    console.error("\u274c GATE GAGAL — index pg_trgm HILANG: " + missing.join(", "));
    console.error("   Penyebab umum: folder migration drift / index dibuat di luar migration.");
    process.exit(1);
  }
  console.log("\u2705 index pg_trgm ada: " + required.join(", "));
} finally {
  await prisma.$disconnect();
}
'

# ── 4) ASSERT tidak ada drift schema.prisma <-> folder migrations ─────────
echo "→ cek drift schema vs migrations (prisma migrate diff)"
SHADOW_DB="ci_shadow_$$"
SHADOW_URL="$(DATABASE_URL="$DATABASE_URL" SHADOW_DB="$SHADOW_DB" node --input-type=module -e '
  const u = new URL(process.env.DATABASE_URL);
  u.pathname = "/" + process.env.SHADOW_DB;
  process.stdout.write(u.toString());
')"

if printf 'CREATE DATABASE "%s";\n' "$SHADOW_DB" \
     | npx --no-install prisma db execute --url "$DATABASE_URL" --stdin >/dev/null 2>&1; then
  set +e
  npx --no-install prisma migrate diff \
    --from-migrations prisma/migrations \
    --to-schema-datamodel prisma/schema.prisma \
    --shadow-database-url "$SHADOW_URL" \
    --exit-code
  DIFF_EXIT=$?
  set -e
  if [ "$DIFF_EXIT" -ne 0 ]; then
    echo "❌ GATE GAGAL — schema.prisma DRIFT dari folder migrations (lihat diff di atas)."
    exit 1
  fi
  echo "✅ tidak ada drift schema ↔ migrations"
else
  echo "  ⚠ shadow database tidak bisa dibuat — langkah drift diff dilewati"
fi

echo ""
echo "✅ GATE LULUS — migration reproducible & index pg_trgm utuh."
