# Testing LLM Recommendations with RAG in Frontend

## Prerequisites

✅ **Backend running:** `http://localhost:8000` (with DEBUG=1 to see logs)  
✅ **Frontend running:** `http://localhost:8082` (or check your vite port)

---

## Test Flow

### 1. Open Frontend

Navigate to: `http://localhost:8082`

---

### 2. Upload a Floor Plan

**Option A: Upload an image**
- Click "Upload" or drag & drop a floor plan image
- Wait for analysis (you'll see "I'm analyzing your floor plan now")

**Option B: Use test layout (via API)**
```bash
# Create test layout via API
curl -X POST http://localhost:8000/api/v1/advisor/layout_cache/upsert \
  -H "Content-Type: application/json" \
  -d '{
    "layout_id": "test-frontend-001",
    "layout_type": "villa",
    "layout_confidence": 0.85,
    "total_area": "2400 sq ft",
    "rooms": [
      {"room_id": "r1", "name": "Living Room", "type": "living", "width": 20, "length": 21, "area": 420},
      {"room_id": "r2", "name": "Master Bedroom", "type": "bedroom", "width": 18, "length": 15, "area": 270},
      {"room_id": "r3", "name": "Entrance", "type": "entry", "width": 8, "length": 6, "area": 48}
    ],
    "entry_points": ["Front door"]
  }'
```

---

### 3. Ask for Recommendations

In the chat, type:
```
I care about security and want good Wi-Fi coverage. What do you recommend?
```

Or:
```
What products do you recommend for my villa?
```

---

### 4. Verify Frontend Display

**Check the "Your Smart Home Plan" panel:**

✅ **Room-by-Room Recommendations:**
- Should show products with **actual room names** (e.g., "Living Room", "Master Bedroom", "Entrance")
- NOT generic names like "Living" or "Bedroom"
- Each product should have:
  - Room name
  - Product name
  - Benefit/reasoning ("why")
  - Price

✅ **Recommended Bundle:**
- Should show bundle name (e.g., "Secure Home Bundle")
- Should list included products
- Should show monthly price (e.g., "AED 89/mo")

✅ **Layout Type:**
- Should show "Villa" (or your layout type)

---

### 5. Check Backend Logs

Watch the backend terminal for:

```
DEBUG | app.llm_recommender | Retrieving relevant knowledge (RAG)
DEBUG | app.llm_recommender | Calling LLM for recommendations
INFO  | app.llm_recommender | Using LLM-generated recommendations: count=4 bundle=B_SECURE_HOME monthly=89
```

**Expected:** You should see RAG retrieval and LLM recommendations being used (not fallback).

---

## What to Look For

### ✅ Success Indicators:

1. **RAG Working:**
   - Backend logs show "Retrieving relevant knowledge (RAG)"

2. **LLM Recommendations:**
   - Backend logs show "Using LLM-generated recommendations"
   - Frontend shows products with **actual room names** from layout
   - Recommendations are personalized (security-focused for security-sensitive customer)

3. **Frontend Display:**
   - Products displayed in "Room-by-Room Recommendations"
   - Bundle shown with correct price
   - Icons match room types

### ❌ Issues to Check:

1. **If you see "Falling back to rule-based":**
   - Check OpenAI API key is configured
   - Check backend logs for errors

2. **If frontend shows generic room names:**
   - Check backend response includes actual room names
   - Check browser console for errors

3. **If recommendations don't appear:**
   - Check `action === "offer_plan"` in response
   - Check browser console for API errors
   - Verify `recommended_products` array is present

---

## Test Scenarios

### Scenario 1: Villa with Security Focus
**Input:** Villa layout + "I care about security"  
**Expected:** 
- Indoor camera (Living Room)
- Outdoor camera (Perimeter)
- Smart lock (Entrance)
- Wi-Fi mesh (Whole Home)
- Bundle: B_SECURE_HOME (89 AED)

### Scenario 2: Apartment Layout
**Input:** Apartment layout + "What do you recommend?"  
**Expected:**
- NO outdoor camera (apartments don't have perimeter)
- Indoor camera (if security-focused)
- Wi-Fi mesh
- Smart lock (if security-focused)

### Scenario 3: Streaming-Heavy Customer
**Input:** Layout + "I love streaming"  
**Expected:**
- Wi-Fi mesh (Whole Home)
- TV Box (Living Room)
- Bundle: B_ENTERTAIN_PLUS (69 AED) or individual products

---

## Browser Console Check

Open browser DevTools (F12) and check:

1. **Network Tab:**
   - `/api/v1/advisor/chat` request
   - Response should include `recommended_products` array
   - Check `action` field (should be "offer_plan")

2. **Console Tab:**
   - No errors
   - Check if `onPlanGenerated` is called

---

## Quick Test Commands

### Test via curl (then check frontend):
```bash
# 1. Create layout
curl -X POST http://localhost:8000/api/v1/advisor/layout_cache/upsert \
  -H "Content-Type: application/json" \
  -d @- << 'EOF'
{
  "layout_id": "test-frontend-001",
  "layout_type": "villa",
  "rooms": [
    {"room_id": "r1", "name": "Living Room", "type": "living", "width": 20, "length": 21, "area": 420},
    {"room_id": "r2", "name": "Master Bedroom", "type": "bedroom", "width": 18, "length": 15, "area": 270},
    {"room_id": "r3", "name": "Entrance", "type": "entry", "width": 8, "length": 6, "area": 48}
  ]
}
EOF

# 2. Get recommendations
curl -X POST http://localhost:8000/api/v1/advisor/chat \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "CUST_1001",
    "layout_id": "test-frontend-001",
    "messages": [{"role": "user", "content": "What do you recommend?"}]
  }' | jq '.recommended_products'
```

Then check frontend - it should display these recommendations!

---

## Expected Frontend Display

```
Your Smart Home Plan
├── Layout: Villa
├── Persona: Wael
├── Room-by-Room Recommendations:
│   ├── Living Room → Smart Indoor Camera (reasoning...)
│   ├── Entrance → Smart Door Lock (reasoning...)
│   ├── Perimeter → Smart Outdoor Camera (reasoning...)
│   └── Whole Home → e& Wi-Fi Mesh Pro (reasoning...)
└── Recommended Bundle:
    ├── Secure Home Bundle
    ├── Products: [Wi-Fi Mesh, Indoor Camera, Smart Lock]
    └── Price: AED 89/mo
```

---

## Troubleshooting

### Frontend not showing recommendations:
1. Check browser console for errors
2. Verify `action === "offer_plan"` in API response
3. Check `onPlanGenerated` callback is called
4. Verify `plan` state is set in Index.tsx

### Wrong room names:
1. Check backend logs - should use actual room names from layout
2. Verify layout has room names (not just IDs)
3. Check LLM response includes correct room names

### No bundle shown:
1. Check `recommended_bundle_id` in API response
2. Verify bundle exists in product catalog
3. Check frontend fetches product catalog correctly

---

## Success Criteria

✅ RAG retrieval happens (backend logs)  
✅ LLM generates recommendations (backend logs)  
✅ Frontend displays recommendations with actual room names  
✅ Bundle is shown correctly  
✅ Recommendations are personalized to customer profile  
✅ No fallback to rule-based (unless LLM fails)
