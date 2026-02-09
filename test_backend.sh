#!/bin/bash

# Test script for Smart Living AI buddy Backend
# Make sure backend is running on http://localhost:8000

BASE_URL="http://localhost:8000/api/v1"
CUSTOMER_ID="CUST_1001"

echo "=========================================="
echo "Testing Smart Living AI buddy Backend"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Health Check
echo -e "${BLUE}1. Health Check${NC}"
echo "GET $BASE_URL/health"
curl -s "$BASE_URL/health" | jq '.'
echo ""
echo ""

# 2. Get Customer Profile
echo -e "${BLUE}2. Get Customer Profile${NC}"
echo "GET $BASE_URL/profile/$CUSTOMER_ID"
curl -s "$BASE_URL/profile/$CUSTOMER_ID" | jq '.'
echo ""
echo ""

# 3. Get Product Catalog
echo -e "${BLUE}3. Get Product Catalog${NC}"
echo "GET $BASE_URL/products/catalog"
curl -s "$BASE_URL/products/catalog" | jq '.products | length as $count | "Products: \($count)"'
echo ""
echo ""

# 4. Create a test layout (simple villa layout)
echo -e "${BLUE}4. Create Test Layout${NC}"
echo "POST $BASE_URL/advisor/layout_cache/upsert"

LAYOUT_JSON='{
  "layout_id": "test-layout-001",
  "layout_type": "villa",
  "layout_confidence": 0.85,
  "total_area": "2400 sq ft",
  "measurement_units": "ft",
  "source_filename": "test_floor_plan.jpg",
  "rooms": [
    {
      "room_id": "r1",
      "name": "Living Room",
      "type": "living",
      "width": 20,
      "length": 21,
      "area": 420,
      "confidence": 0.9
    },
    {
      "room_id": "r2",
      "name": "Master Bedroom",
      "type": "bedroom",
      "width": 18,
      "length": 15,
      "area": 270,
      "confidence": 0.88
    },
    {
      "room_id": "r3",
      "name": "Kitchen / Dining",
      "type": "kitchen",
      "width": 19,
      "length": 14,
      "area": 266,
      "confidence": 0.85
    },
    {
      "room_id": "r4",
      "name": "Entrance",
      "type": "entry",
      "width": 8,
      "length": 6,
      "area": 48,
      "confidence": 0.8
    }
  ],
  "entry_points": ["Front door"],
  "mentioned_spaces_area": 1004,
  "unassigned_space": 1396
}'

curl -s -X POST "$BASE_URL/advisor/layout_cache/upsert" \
  -H "Content-Type: application/json" \
  -d "$LAYOUT_JSON" | jq '.'
echo ""
echo ""

# 5. Test Advisor Chat (with recommendations)
echo -e "${BLUE}5. Test Advisor Chat with Recommendations${NC}"
echo "POST $BASE_URL/advisor/chat"
echo -e "${YELLOW}This will test LLM recommendations with RAG${NC}"

CHAT_JSON='{
  "customer_id": "CUST_1001",
  "layout_id": "test-layout-001",
  "messages": [
    {
      "role": "user",
      "content": "I care about security and want good Wi-Fi coverage. What do you recommend?"
    }
  ]
}'

echo "Request:"
echo "$CHAT_JSON" | jq '.'
echo ""
echo "Response:"
curl -s -X POST "$BASE_URL/advisor/chat" \
  -H "Content-Type: application/json" \
  -d "$CHAT_JSON" | jq '{
    answer: .answer,
    action: .action,
    recommended_products: .recommended_products,
    recommended_bundle_id: .recommended_bundle_id,
    estimated_monthly: .estimated_monthly
  }'
echo ""
echo ""

# 6. Test Advisor Chat Stream (optional - shows streaming)
echo -e "${BLUE}6. Test Advisor Chat Stream (SSE)${NC}"
echo "POST $BASE_URL/advisor/chat/stream"
echo -e "${YELLOW}This will stream the response${NC}"
echo "Press Ctrl+C to stop..."
echo ""

STREAM_JSON='{
  "customer_id": "CUST_1001",
  "layout_id": "test-layout-001",
  "messages": [
    {
      "role": "user",
      "content": "What products do you recommend for my villa?"
    }
  ]
}'

curl -s -N -X POST "$BASE_URL/advisor/chat/stream" \
  -H "Content-Type: application/json" \
  -d "$STREAM_JSON" | while IFS= read -r line; do
    if [[ $line == data:* ]]; then
      data="${line#data: }"
      echo "$data" | jq -r 'if .partial_content then .partial_content else "" end' 2>/dev/null
    fi
  done

echo ""
echo ""

# 7. Test without layout (conversation only)
echo -e "${BLUE}7. Test Chat Without Layout${NC}"
echo "POST $BASE_URL/advisor/chat (no layout_id)"

CHAT_NO_LAYOUT='{
  "customer_id": "CUST_1001",
  "messages": [
    {
      "role": "user",
      "content": "Hi, I have a villa with 4 bedrooms and a large living room. What do you recommend?"
    }
  ]
}'

curl -s -X POST "$BASE_URL/advisor/chat" \
  -H "Content-Type: application/json" \
  -d "$CHAT_NO_LAYOUT" | jq '{
    answer: .answer,
    action: .action,
    recommended_products: .recommended_products | length
  }'
echo ""
echo ""

echo -e "${GREEN}=========================================="
echo "Testing Complete!"
echo "==========================================${NC}"
echo ""
echo "Check backend logs for:"
echo "  - 'Retrieving relevant knowledge (RAG)'"
echo "  - 'Using LLM-generated recommendations' or 'Falling back to rule-based'"
echo "  - Recommendation details"
