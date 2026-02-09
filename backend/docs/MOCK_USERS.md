# Mock Users Reference

**Date:** February 8, 2026  
**File:** `data/mock_crm_profiles.json`

## Overview

Mock user profiles for testing different recommendation scenarios. Each user has different segments, usage patterns, and household compositions.

---

## User Profiles

### CUST_1001 - Wael (Premium Family)
- **Segment:** Premium
- **City:** Cairo
- **Household:** 2 adults, 2 kids
- **Usage:** Streaming-heavy, Work from home, Security-sensitive
- **Services:** eLife Ultra (500 Mbps), evision Max
- **Use Case:** Premium family with security and entertainment needs

---

### CUST_2002 - Maha (Mid Single)
- **Segment:** Mid
- **City:** Dubai
- **Household:** 1 adult, 1 pet
- **Usage:** Streaming-heavy, Gaming
- **Services:** eLife Starter (250 Mbps), evision Basic
- **Use Case:** Single person with entertainment focus

---

### CUST_3003 - Ahmed (Value Single)
- **Segment:** Value
- **City:** Abu Dhabi
- **Household:** 1 adult
- **Usage:** Basic usage (no heavy streaming/gaming/security)
- **Services:** eLife Basic (100 Mbps), No TV
- **Use Case:** Budget-conscious single user, minimal needs

---

### CUST_4004 - Fatima (Premium Large Family)
- **Segment:** Premium
- **City:** Dubai
- **Household:** 2 adults, 3 kids, 2 pets
- **Usage:** Streaming-heavy, Work from home, Gaming, Security-sensitive
- **Services:** eLife Ultra (1000 Mbps), evision Max
- **Use Case:** Large premium family with all needs (entertainment, work, security)

---

### CUST_5005 - Omar (Mid Family)
- **Segment:** Mid
- **City:** Sharjah
- **Household:** 2 adults, 1 kid
- **Usage:** Streaming-heavy, Work from home, Security-sensitive
- **Services:** eLife Plus (350 Mbps), evision Plus
- **Use Case:** Mid-tier family with security and work needs

---

### CUST_6006 - Sarah (Premium Single Professional)
- **Segment:** Premium
- **City:** Dubai
- **Household:** 1 adult
- **Usage:** Work from home, Security-sensitive
- **Services:** eLife Ultra (500 Mbps), evision Max
- **Use Case:** Premium single professional, security-focused, work from home

---

### CUST_7007 - Khalid (Value Family)
- **Segment:** Value
- **City:** Ajman
- **Household:** 2 adults, 2 kids
- **Usage:** Streaming-heavy
- **Services:** eLife Basic (100 Mbps), evision Basic
- **Use Case:** Budget-conscious family with entertainment needs

---

### CUST_8008 - Layla (Mid Single Parent)
- **Segment:** Mid
- **City:** Dubai
- **Household:** 1 adult, 1 kid, 1 pet
- **Usage:** Streaming-heavy, Gaming, Security-sensitive
- **Services:** eLife Starter (250 Mbps), evision Plus
- **Use Case:** Single parent with security and entertainment needs

---

### CUST_9009 - Youssef (Premium Couple)
- **Segment:** Premium
- **City:** Abu Dhabi
- **Household:** 2 adults
- **Usage:** Streaming-heavy, Work from home, Gaming, Security-sensitive
- **Services:** eLife Ultra (1000 Mbps), evision Max
- **Use Case:** Premium couple with all needs (entertainment, work, gaming, security)

---

### CUST_1010 - Noor (Value Single Professional)
- **Segment:** Value
- **City:** Ras Al Khaimah
- **Household:** 1 adult
- **Usage:** Work from home
- **Services:** eLife Basic (100 Mbps), No TV
- **Use Case:** Budget-conscious single professional, work from home only

---

## Usage Patterns Summary

### By Segment:
- **Premium:** CUST_1001, CUST_4004, CUST_6006, CUST_9009 (4 users)
- **Mid:** CUST_2002, CUST_5005, CUST_8008 (3 users)
- **Value:** CUST_3003, CUST_7007, CUST_1010 (3 users)

### By Usage Type:
- **Streaming-heavy:** CUST_1001, CUST_2002, CUST_4004, CUST_5005, CUST_7007, CUST_8008, CUST_9009 (7 users)
- **Work from home:** CUST_1001, CUST_4004, CUST_5005, CUST_6006, CUST_9009, CUST_1010 (6 users)
- **Gaming:** CUST_2002, CUST_4004, CUST_8008, CUST_9009 (4 users)
- **Security-sensitive:** CUST_1001, CUST_4004, CUST_5005, CUST_6006, CUST_8008, CUST_9009 (6 users)

### By Household:
- **Single:** CUST_2002, CUST_3003, CUST_6006, CUST_1010 (4 users)
- **Couple:** CUST_9009 (1 user)
- **Family (2+ kids):** CUST_1001, CUST_4004, CUST_5005, CUST_7007, CUST_8008 (5 users)

---

## Testing Scenarios

### Premium Recommendations:
- **CUST_1001, CUST_4004, CUST_6006, CUST_9009** - Should get premium bundles/products

### Value Recommendations:
- **CUST_3003, CUST_7007, CUST_1010** - Should get value-focused recommendations

### Security-Focused:
- **CUST_1001, CUST_4004, CUST_5005, CUST_6006, CUST_8008, CUST_9009** - Should prioritize security products

### Entertainment-Focused:
- **CUST_2002, CUST_4004, CUST_5005, CUST_7007, CUST_8008, CUST_9009** - Should prioritize entertainment products

### Work from Home:
- **CUST_1001, CUST_4004, CUST_5005, CUST_6006, CUST_9009, CUST_1010** - Should prioritize reliable Wi-Fi

---

## Usage in Tests

```bash
# Test with premium user
curl -X POST http://localhost:8000/api/v1/advisor/chat \
  -H "Content-Type: application/json" \
  -d '{"customer_id": "CUST_1001", "messages": [...]}'

# Test with value user
curl -X POST http://localhost:8000/api/v1/advisor/chat \
  -H "Content-Type: application/json" \
  -d '{"customer_id": "CUST_3003", "messages": [...]}'
```
