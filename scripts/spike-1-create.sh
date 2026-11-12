#!/usr/bin/env bash
# Phase 1 spike, steps 1-2: get a token and create a sandbox order. Usage: PAYPAL_CLIENT_ID=.. PAYPAL_CLIENT_SECRET=.. bash scripts/spike-1-create.sh [USD|INR] [amount]
set -euo pipefail
[ -f .env ] && set -a && . ./.env && set +a
CUR="${1:-USD}"; AMT="${2:-215.00}"; BASE="${PAYPAL_BASE_URL:-https://api-m.sandbox.paypal.com}"
TOKEN=$(curl -s -X POST "$BASE/v1/oauth2/token" -u "$PAYPAL_CLIENT_ID:$PAYPAL_CLIENT_SECRET" -d grant_type=client_credentials | node -pe 'JSON.parse(require("fs").readFileSync(0)).access_token')
[ -n "$TOKEN" ] && echo "token ok" || { echo "token failed"; exit 1; }
echo "$TOKEN" > .spike_token   # local only; git-ignored
curl -s -i -X POST "$BASE/v2/checkout/orders" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "PayPal-Request-Id: spike-$(date +%s)" \
  -d "{\"intent\":\"CAPTURE\",\"purchase_units\":[{\"reference_id\":\"REQ-1\",\"amount\":{\"currency_code\":\"$CUR\",\"value\":\"$AMT\"}}],
       \"payment_source\":{\"paypal\":{\"experience_context\":{\"brand_name\":\"FairCart Guard\",\"user_action\":\"PAY_NOW\",
       \"return_url\":\"http://localhost:4000/payments/return\",\"cancel_url\":\"http://localhost:4000/payments/cancel\"}}}}" \
  | tee .spike_order_response.txt | grep -iE "^HTTP|paypal-debug-id|\"id\"|\"status\"|\"rel\"|\"href\"|\"name\"|\"issue\"" || true
echo; echo "Open the link whose rel is payer-action (or approve), log in as the SANDBOX BUYER, approve, then run: bash scripts/spike-2-capture.sh <ORDER_ID>"
