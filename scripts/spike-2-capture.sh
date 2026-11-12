#!/usr/bin/env bash
# Phase 1 spike, steps 3-4: read and capture an approved order. Usage: bash scripts/spike-2-capture.sh <ORDER_ID>
set -euo pipefail
[ -f .env ] && set -a && . ./.env && set +a
ORDER_ID="${1:?order id required}"; BASE="${PAYPAL_BASE_URL:-https://api-m.sandbox.paypal.com}"; TOKEN=$(cat .spike_token)
echo "--- GET order"; curl -s "$BASE/v2/checkout/orders/$ORDER_ID" -H "Authorization: Bearer $TOKEN" | grep -E '"status"|"id"' | head -5
echo "--- CAPTURE"
curl -s -i -X POST "$BASE/v2/checkout/orders/$ORDER_ID/capture" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "PayPal-Request-Id: spike-capture-$ORDER_ID" -d '{}' \
  | grep -iE "^HTTP|paypal-debug-id|\"id\"|\"status\"|\"value\"|\"currency_code\"|\"issue\"" || true
echo; echo "Record order id, capture id, statuses and debug ids in docs/paypal-spike.md"
