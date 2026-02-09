# Curl Test Commands for Backend

Make sure backend is running: `cd backend && uvicorn app.main:app --reload --port 8000`

Base URL: `http://localhost:8000/api/v1`

---

## 1. Health Check

```bash
curl http://localhost:8000/api/v1/health | jq
```

---

## 2. Get Customer Profile

```bash
curl http://localhost:8000/api/v1/profile/CUST_1001 | jq
```

---

## 3. Get Product Catalog

```bash
curl http://localhost:8000/api/v1/products/catalog | jq
```

---

## 4. Create Test Layout (Villa)

```bash
curl -X POST http://localhost:8000/api/v1/advisor/layout_cache/upsert \
  -H "Content-Type: application/json" \
  -d '{
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
  }' | jq
```

---

## 5. Test Advisor Chat with Recommendations (RAG + LLM)

**This tests the full flow: RAG retrieval → LLM recommendations → Advisor response**

```bash
curl -X POST http://localhost:8000/api/v1/advisor/chat \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "CUST_1001",
    "layout_id": "test-layout-001",
    "messages": [
      {
        "role": "user",
        "content": "I care about security and want good Wi-Fi coverage. What do you recommend?"
      }
    ]
  }' | jq '{
    answer: .answer,
    action: .action,
    recommended_products: .recommended_products,
    recommended_bundle_id: .recommended_bundle_id,
    estimated_monthly: .estimated_monthly
  }'
```

**Expected:** 
- RAG retrieves security-focused knowledge
- LLM generates recommendations using actual room names
- Returns products with reasoning

---

## 6. Test Streaming Chat

```bash
curl -N -X POST http://localhost:8000/api/v1/advisor/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "CUST_1001",
    "layout_id": "test-layout-001",
    "messages": [
      {
        "role": "user",
        "content": "What products do you recommend for my villa?"
      }
    ]
  }'
```

---

## 7. Test Chat Without Layout

```bash
curl -X POST http://localhost:8000/api/v1/advisor/chat \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "CUST_1001",
    "messages": [
      {
        "role": "user",
        "content": "Hi, I have a villa with 4 bedrooms. What do you recommend?"
      }
    ]
  }' | jq '{
    answer: .answer,
    action: .action,
    recommended_products: .recommended_products
  }'
```

---

## 8. Test Different Customer Profile

```bash
curl -X POST http://localhost:8000/api/v1/advisor/chat \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "CUST_2002",
    "layout_id": "test-layout-001",
    "messages": [
      {
        "role": "user",
        "content": "I love streaming and gaming. What do you recommend?"
      }
    ]
  }' | jq '{
    answer: .answer,
    recommended_products: .recommended_products
  }'
```

**Expected:** Different recommendations (streaming-focused, not security-focused)

---

## 9. Test Apartment Layout

```bash
# Create apartment layout
curl -X POST http://localhost:8000/api/v1/advisor/layout_cache/upsert \
  -H "Content-Type: application/json" \
  -d '{
    "layout_id": "test-apartment-001",
    "layout_type": "apartment",
    "layout_confidence": 0.9,
    "total_area": "1200 sq ft",
    "measurement_units": "ft",
    "source_filename": "apartment_plan.jpg",
    "rooms": [
      {
        "room_id": "r1",
        "name": "Living Room",
        "type": "living",
        "width": 15,
        "length": 12,
        "area": 180,
        "confidence": 0.9
      },
      {
        "room_id": "r2",
        "name": "Bedroom",
        "type": "bedroom",
        "width": 12,
        "length": 10,
        "area": 120,
        "confidence": 0.88
      },
      {
        "room_id": "r3",
        "name": "Entrance",
        "type": "entry",
        "width": 6,
        "length": 4,
        "area": 24,
        "confidence": 0.8
      }
    ],
    "entry_points": ["Front door"],
    "mentioned_spaces_area": 324,
    "unassigned_space": 876
  }' | jq

# Test chat with apartment
curl -X POST http://localhost:8000/api/v1/advisor/chat \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "CUST_1001",
    "layout_id": "test-apartment-001",
    "messages": [
      {
        "role": "user",
        "content": "What do you recommend for my apartment?"
      }
    ]
  }' | jq '{
    answer: .answer,
    recommended_products: .recommended_products
  }'
```

**Expected:** No outdoor camera (apartments don't have outdoor space)

---

## Check Backend Logs

Watch backend terminal for:
- `Retrieving relevant knowledge (RAG)` - RAG is working
- `Using LLM-generated recommendations` - LLM recommendations used
- `Falling back to rule-based recommendations` - Fallback triggered
- Recommendation details and reasoning

---

## Quick Test Script

Run all tests at once:

```bash
./test_backend.sh
```

Or run individual commands from this file.
