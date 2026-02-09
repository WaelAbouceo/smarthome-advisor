from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Any, List
from fastapi import APIRouter, HTTPException
from app.core.config import settings
from app.core.prompts import get_prompt
from app.repositories.crm_repo import CRMRepository
from app.repositories.product_repo import ProductRepository
from app.core.logging import get_logger

router = APIRouter()
logger = get_logger("api.admin")

crm = CRMRepository()
prod = ProductRepository()


@router.get("/users")
def get_users() -> Dict[str, Any]:
    """Get all users from CRM profiles."""
    try:
        profiles = crm._load()
        # Convert to list format for easier display
        users_list = []
        for customer_id, profile in profiles.items():
            users_list.append({
                "customer_id": customer_id,
                **profile
            })
        return {
            "total": len(users_list),
            "users": users_list
        }
    except Exception as e:
        logger.error("Failed to load users: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to load users: {str(e)}")


@router.get("/products")
def get_products() -> Dict[str, Any]:
    """Get product catalog."""
    try:
        catalog = prod.get_catalog()
        return catalog
    except Exception as e:
        logger.error("Failed to load products: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to load products: {str(e)}")


@router.get("/prompts")
def get_prompts() -> Dict[str, Any]:
    """Get all prompt files."""
    try:
        prompts_dir = settings.prompts_dir
        prompts: Dict[str, str] = {}
        
        # List all .md and .txt files in prompts directory
        for ext in (".md", ".txt"):
            for prompt_file in prompts_dir.glob(f"*{ext}"):
                prompt_name = prompt_file.stem  # filename without extension
                if prompt_name not in prompts:  # Prefer .md over .txt if both exist
                    prompt_content = get_prompt(prompt_name, use_cache=False)
                    prompts[prompt_name] = prompt_content
        
        return {
            "prompts_dir": str(prompts_dir),
            "total": len(prompts),
            "prompts": prompts
        }
    except Exception as e:
        logger.error("Failed to load prompts: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to load prompts: {str(e)}")


@router.get("/business-rules")
def get_business_rules() -> Dict[str, Any]:
    """Get business rules logic from recommendation services."""
    try:
        # Read the rule-based recommender logic
        recommender_file = Path(__file__).resolve().parents[2] / "services" / "recommendation" / "recommender.py"
        recommender_code = ""
        if recommender_file.exists():
            recommender_code = recommender_file.read_text(encoding="utf-8")
        
        # Read RAG retriever logic
        rag_file = Path(__file__).resolve().parents[2] / "services" / "recommendation" / "rag_retriever.py"
        rag_code = ""
        if rag_file.exists():
            rag_code = rag_file.read_text(encoding="utf-8")
        
        # Extract RAG knowledge base
        try:
            from app.services.recommendation.rag_retriever import PRODUCT_KNOWLEDGE_BASE
        except ImportError:
            PRODUCT_KNOWLEDGE_BASE = {}
        
        return {
            "rule_based_recommender": {
                "file": str(recommender_file),
                "code": recommender_code,
                "description": "Deterministic rule-based recommendation logic (fallback when LLM is unavailable)"
            },
            "rag_retriever": {
                "file": str(rag_file),
                "code": rag_code,
                "description": "RAG (Retrieval-Augmented Generation) knowledge base and retrieval logic"
            },
            "knowledge_base": PRODUCT_KNOWLEDGE_BASE,
            "llm_recommender": {
                "file": "app/services/recommendation/llm_recommender.py",
                "description": "LLM-powered recommendation engine with validation and fallback to rule-based",
                "note": "Uses recommender_system.md prompt for LLM context"
            }
        }
    except Exception as e:
        logger.error("Failed to load business rules: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to load business rules: {str(e)}")
