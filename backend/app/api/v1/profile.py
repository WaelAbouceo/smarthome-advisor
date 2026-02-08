from fastapi import APIRouter, HTTPException
from app.repositories.crm_repo import CRMRepository
from app.services.persona.persona_builder import build_persona

router = APIRouter()
crm = CRMRepository()

@router.get("/{customer_id}")
def get_profile(customer_id: str):
    p = crm.get_profile(customer_id)
    if not p:
        raise HTTPException(status_code=404, detail="Customer not found")
    persona = build_persona(p).model_dump()
    return {"profile": p, "persona": persona}
