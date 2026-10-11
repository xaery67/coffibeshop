#!/usr/bin/env bash
# Smoke test end-to-end terhadap stack yang berjalan (docker compose up).
set -euo pipefail
API="${API_BASE:-http://localhost:4000}"

echo "-> /health"
curl -fsS "$API/health" | grep -q '"status":"ok"'

echo "-> /api/v1/config"
curl -fsS "$API/api/v1/config" | grep -q '"success":true'

echo "-> /api/v1/catalog/products"
curl -fsS "$API/api/v1/catalog/products" | grep -q '"success":true'

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

echo "OK - SEMUA SMOKE TEST LULUS"
