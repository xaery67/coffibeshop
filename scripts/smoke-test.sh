#!/usr/bin/env bash
# Smoke test end-to-end terhadap stack yang berjalan (docker compose / staging).
# issue #17 — dipakai juga oleh job "Smoke test (staging)" di CD.
set -euo pipefail

API="${STAGING_BASE_URL:-${API_BASE:-http://localhost:4000}}"
WAIT="${SMOKE_WAIT_SECONDS:-0}"

echo "→ target: $API"

# ── Tunggu container sehat (opsional; di CI staging) ──────────────────────
if [ "$WAIT" -gt 0 ]; then
  echo "→ menunggu /health siap (maks ${WAIT}s)"
  ready=0
  for i in $(seq 1 "$WAIT"); do
    if curl -fsS "$API/health" >/dev/null 2>&1; then ready=1; echo "   siap setelah ${i}s"; break; fi
    sleep 1
  done
  if [ "$ready" -ne 1 ]; then
    echo "❌ /health tidak siap dalam ${WAIT}s"; exit 1
  fi
fi

echo "-> /health"
curl -fsS "$API/health" | grep -q '"status":"ok"'

echo "-> /api/v1/config"
curl -fsS "$API/api/v1/config" | grep -q '"success":true'

echo "-> /api/v1/catalog/products"
curl -fsS "$API/api/v1/catalog/products" | grep -q '"success":true'

# Alur tulis hanya dijalankan untuk stack lokal/dev (butuh DB + Redis).
if [ "${SMOKE_FULL:-1}" = "1" ]; then
  GID="$(python -c 'import uuid;print(uuid.uuid4())')"
  PID="$(curl -fsS "$API/api/v1/catalog/products" | python -c 'import sys,json;print(json.load(sys.stdin)["data"]["data"][0]["id"])')"

  echo "-> tambah ke cart (guest $GID)"
  curl -fsS -X POST "$API/api/v1/orders/cart/items" \
    -H 'Content-Type: application/json' -H "X-Guest-Id: $GID" \
    -d "{\"product_id\":\"$PID\",\"qty\":1,\"option_ids\":[]}" | grep -q '"success":true'

  echo "-> checkout"
  RESP="$(curl -fsS -X POST "$API/api/v1/orders/checkout" \
    -H 'Content-Type: application/json' -H "X-Guest-Id: $GID" \
    -d '{"fulfillment_type":"pickup","payment_method":"qris"}')"
  echo "$RESP" | grep -q '"tracking_token"'
  TOKEN="$(echo "$RESP" | python -c 'import sys,json;print(json.load(sys.stdin)["data"]["tracking_token"])')"

  echo "-> lacak via token"
  curl -fsS "$API/api/v1/orders/track/$TOKEN" | grep -q '"success":true'
fi

echo "OK - SEMUA SMOKE TEST LULUS"
