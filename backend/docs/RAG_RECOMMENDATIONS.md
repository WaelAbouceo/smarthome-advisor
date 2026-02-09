# RAG (Retrieval-Augmented Generation) for Recommendations

## Overview

RAG is integrated into the recommendation system to retrieve relevant product knowledge, best practices, and use cases **before** the LLM call. This enhances the LLM's recommendations with structured knowledge.

## Architecture

```
User Request
    ↓
RAG Retrieval (rag_retriever.py)
    ↓
Retrieve: Layout best practices, use case patterns, product knowledge, conversation insights
    ↓
Augment LLM Prompt with Retrieved Knowledge
    ↓
LLM Call (with RAG context)
    ↓
Generate Recommendations
```

## Implementation

### File: `backend/app/services/recommendation/rag_retriever.py`

**Main Function:** `retrieve_relevant_knowledge()`

Retrieves:
1. **Layout Best Practices** - Based on layout type (apartment/villa/office)
2. **Use Case Patterns** - Based on customer profile (security/streaming/WFH)
3. **Product Knowledge** - Use cases, room recommendations, best-for scenarios
4. **Conversation Insights** - Extract preferences from chat history
5. **Large Home Considerations** - Special handling for >2000 sq ft homes

### Knowledge Bases

#### 1. Product Knowledge Base (`PRODUCT_KNOWLEDGE_BASE`)
- **Use cases** - When to use each product
- **Room recommendations** - Best placement for each room type
- **Best for** - Target customer segments
- **Requirements** - Prerequisites (e.g., outdoor camera needs villa)

#### 2. Layout Best Practices (`LAYOUT_BEST_PRACTICES`)
- **Priorities** - What matters for each layout type
- **Common rooms** - Typical rooms in each layout
- **Recommended products** - Default suggestions per layout type

#### 3. Use Case Patterns (`USE_CASE_PATTERNS`)
- **Priority products** - Products for each use case
- **Reasoning** - Why these products fit
- **Room focus** - Which rooms to prioritize

## Integration

### In `llm_recommender.py`:

```python
# RAG: Retrieve relevant knowledge before LLM call
retrieved_knowledge = retrieve_relevant_knowledge(
    profile, layout, product_map, conversation_history
)

# Augment prompt with RAG knowledge
system_prompt = prompt_base
if retrieved_knowledge:
    system_prompt += "\n\n---\nRetrieved Knowledge (RAG):\n" + retrieved_knowledge
system_prompt += "\n\n---\nContext:\n" + context
```

## What RAG Retrieves

### Example Output:

```
Layout Best Practices:
- Priorities: Full coverage (may need multiple mesh nodes), Indoor and outdoor security, Perimeter protection
- Common rooms: living, master_bedroom, kitchen, garden, perimeter
- Typically recommended products: P_WIFI_MESH_01, P_CAM_INDOOR_01, P_CAM_OUTDOOR_01, P_SMART_LOCK_01

Use Case Pattern: Security Sensitive:
- Reasoning: Security-focused customers need cameras and smart locks for peace of mind
- Priority products: P_CAM_INDOOR_01, P_SMART_LOCK_01, P_CAM_OUTDOOR_01
- Room focus: entrance, living, perimeter

Product Knowledge:

e& Wi-Fi Mesh Pro (P_WIFI_MESH_01):
  Use cases:
    - Multi-room coverage for streaming and work
    - Large homes (>2000 sq ft) need mesh for consistent coverage
    - Essential for work-from-home setups
  Room recommendations:
    - large_living: Place primary node in living room for best coverage
    - multi_floor: One node per floor recommended

Smart Indoor Camera (P_CAM_INDOOR_01):
  Use cases:
    - Monitor entrances and main living areas
    - Keep an eye on children or elderly family members
    - Security for ground floor apartments
  Room recommendations:
    - entrance: Best placement for entry monitoring
    - living_room: Central location for main area coverage
  Best for:
    - Security-conscious families
    - Homes with elderly residents

Conversation Insights:
- User mentioned: security → User expressed interest in security
```

## Benefits

### 1. **Structured Knowledge**
- Pre-defined best practices and use cases
- Consistent recommendations across similar scenarios

### 2. **Context-Aware Retrieval**
- Retrieves knowledge relevant to specific layout type
- Adapts to customer profile and use cases

### 3. **Enhanced LLM Understanding**
- LLM receives curated knowledge, not just raw data
- Better recommendations with less hallucination

### 4. **Conversation Awareness**
- Extracts preferences from chat history
- Adapts recommendations to user's stated needs

## Knowledge Base Structure

### Product Knowledge Format:
```python
"P_PRODUCT_ID": {
    "use_cases": [...],
    "room_recommendations": {...},
    "best_for": [...],
    "requirements": [...],  # Optional
}
```

### Layout Best Practices Format:
```python
"layout_type": {
    "priorities": [...],
    "common_rooms": [...],
    "recommended_products": [...],
}
```

### Use Case Patterns Format:
```python
"use_case_key": {
    "priority_products": [...],
    "reasoning": "...",
    "room_focus": [...],
}
```

## Future Enhancements

### 1. **Vector Database**
- Store product knowledge in vector DB (e.g., Chroma, Pinecone)
- Semantic search instead of keyword matching
- More flexible retrieval

### 2. **Embeddings**
- Embed product descriptions, use cases
- Similarity search for relevant products
- Better matching to user needs

### 3. **Historical Data**
- Learn from past recommendations
- What worked for similar customers
- Success patterns

### 4. **Dynamic Knowledge Base**
- Update knowledge from product catalog
- Learn from customer feedback
- Continuous improvement

## Example Flow

1. **User has:** Villa, security_sensitive=true, conversation mentions "security"
2. **RAG retrieves:**
   - Villa best practices (outdoor cameras, multiple mesh nodes)
   - Security use case pattern (cameras, locks)
   - Product knowledge for cameras and locks
   - Conversation insight: "User expressed interest in security"
3. **LLM receives:** Prompt + RAG knowledge + Context
4. **LLM generates:** Recommendations with security focus, using actual room names, with reasoning based on retrieved knowledge

## Notes

- RAG runs **before** LLM call (no extra latency in LLM)
- Knowledge base is currently in-memory (fast retrieval)
- Can be extended to external knowledge sources
- RAG context is added to prompt, not replacing context
