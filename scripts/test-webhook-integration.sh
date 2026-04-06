#!/bin/bash
# Integration tests for the webhook endpoint
# Tests actual HTTP responses (but uses fake phone numbers that won't deliver)
#
# These tests verify:
# 1. Webhook accepts valid payloads → 200
# 2. GET verification works
# 3. Various message types are processed

WEBHOOK_URL="https://bolt-whatsapp-ai.vercel.app/api/webhooks/whatsapp"
PASS=0
FAIL=0
TOTAL=0

test_result() {
  local TEST_NAME=$1
  local EXPECTED_CODE=$2
  local ACTUAL_CODE=$3
  local BODY=$4
  TOTAL=$((TOTAL + 1))

  if [ "$ACTUAL_CODE" = "$EXPECTED_CODE" ]; then
    echo "  ✅ $TEST_NAME (HTTP $ACTUAL_CODE)"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $TEST_NAME — expected $EXPECTED_CODE, got $ACTUAL_CODE"
    echo "     Body: $BODY"
    FAIL=$((FAIL + 1))
  fi
}

send_message() {
  local PHONE=$1
  local NAME=$2
  local MESSAGE=$3

  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "{
      \"object\": \"whatsapp_business_account\",
      \"entry\": [{
        \"id\": \"1827850934552942\",
        \"changes\": [{
          \"value\": {
            \"messaging_product\": \"whatsapp\",
            \"metadata\": {
              \"display_phone_number\": \"5215529955607\",
              \"phone_number_id\": \"1068114649715169\"
            },
            \"contacts\": [{
              \"profile\": { \"name\": \"$NAME\" },
              \"wa_id\": \"$PHONE\"
            }],
            \"messages\": [{
              \"from\": \"$PHONE\",
              \"id\": \"wamid.test_$(date +%s%N)\",
              \"timestamp\": \"$(date +%s)\",
              \"type\": \"text\",
              \"text\": { \"body\": \"$MESSAGE\" }
            }]
          },
          \"field\": \"messages\"
        }]
      }]
    }" 2>&1)

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -n -1)
  echo "$HTTP_CODE|$BODY"
}

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Bolt WhatsApp AI — Integration Test Suite"
echo "  Webhook: $WEBHOOK_URL"
echo "  Time: $(date)"
echo "═══════════════════════════════════════════════════════"

# ──────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST GROUP 1: Webhook Verification (GET)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test: GET with wrong token should fail
RESPONSE=$(curl -s -w "\n%{http_code}" "$WEBHOOK_URL?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=test123" 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)
test_result "GET with wrong verify token → 403" "403" "$HTTP_CODE" "$BODY"

# Test: Invalid method
RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT "$WEBHOOK_URL" -H "Content-Type: application/json" -d '{}' 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)
test_result "PUT method → 405" "405" "$HTTP_CODE" "$BODY"

# ──────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST GROUP 2: Message Processing (POST)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test: Spanish greeting
RESULT=$(send_message "5219999000001" "Test Bot Logic 1" "Hola, buenas tardes")
HTTP_CODE=$(echo "$RESULT" | cut -d'|' -f1)
BODY=$(echo "$RESULT" | cut -d'|' -f2-)
test_result "Spanish greeting → 200" "200" "$HTTP_CODE" "$BODY"
sleep 2

# Test: English greeting
RESULT=$(send_message "5219999000002" "Test Bot Logic 2" "Hello, I need a website for my business")
HTTP_CODE=$(echo "$RESULT" | cut -d'|' -f1)
BODY=$(echo "$RESULT" | cut -d'|' -f2-)
test_result "English message → 200" "200" "$HTTP_CODE" "$BODY"
sleep 2

# Test: Price inquiry (Spanish)
RESULT=$(send_message "5219999000003" "Test Bot Logic 3" "Cuánto cuesta una página web?")
HTTP_CODE=$(echo "$RESULT" | cut -d'|' -f1)
BODY=$(echo "$RESULT" | cut -d'|' -f2-)
test_result "Price inquiry (ES) → 200" "200" "$HTTP_CODE" "$BODY"
sleep 2

# Test: Deferral message (should trigger auto-pause)
RESULT=$(send_message "5219999000004" "Test Bot Logic 4" "Estoy manejando, luego te aviso")
HTTP_CODE=$(echo "$RESULT" | cut -d'|' -f1)
BODY=$(echo "$RESULT" | cut -d'|' -f2-)
test_result "Deferral message → 200" "200" "$HTTP_CODE" "$BODY"
sleep 2

# Test: Empty/status-only webhook (no messages)
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "1827850934552942",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": {
            "display_phone_number": "5215529955607",
            "phone_number_id": "1068114649715169"
          },
          "statuses": [{
            "id": "wamid.status123",
            "status": "delivered",
            "timestamp": "1234567890",
            "recipient_id": "5219999000001"
          }]
        },
        "field": "messages"
      }]
    }]
  }' 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)
test_result "Status webhook (no messages) → 200" "200" "$HTTP_CODE" "$BODY"

# ──────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST GROUP 3: Edge Cases"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test: Malformed JSON
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d 'not valid json' 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)
test_result "Malformed JSON → 200 (graceful)" "200" "$HTTP_CODE" "$BODY"

# Test: Reaction message (should be skipped, no AI response)
sleep 2
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"object\": \"whatsapp_business_account\",
    \"entry\": [{
      \"id\": \"1827850934552942\",
      \"changes\": [{
        \"value\": {
          \"messaging_product\": \"whatsapp\",
          \"metadata\": {
            \"display_phone_number\": \"5215529955607\",
            \"phone_number_id\": \"1068114649715169\"
          },
          \"contacts\": [{
            \"profile\": { \"name\": \"Test Bot Logic 5\" },
            \"wa_id\": \"5219999000005\"
          }],
          \"messages\": [{
            \"from\": \"5219999000005\",
            \"id\": \"wamid.reaction_$(date +%s)\",
            \"timestamp\": \"$(date +%s)\",
            \"type\": \"reaction\",
            \"reaction\": { \"message_id\": \"wamid.some_message\", \"emoji\": \"👍\" }
          }]
        },
        \"field\": \"messages\"
      }]
    }]
  }" 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)
test_result "Reaction message → 200" "200" "$HTTP_CODE" "$BODY"

# ──────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  RESULTS: $PASS/$TOTAL passed, $FAIL failed"
echo "═══════════════════════════════════════════════════════"
echo ""

# Exit with failure code if any tests failed
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
