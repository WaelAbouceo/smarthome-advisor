from fastapi import APIRouter
from app.api.v1.health import router as health_router
from app.api.v1.profile import router as profile_router
from app.api.v1.products import router as products_router
from app.api.v1.layout import router as layout_router
from app.api.v1.advisor import router as advisor_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(health_router, tags=["health"])
api_router.include_router(profile_router, prefix="/profile", tags=["profile"])
api_router.include_router(products_router, prefix="/products", tags=["products"])
api_router.include_router(layout_router, prefix="/layout", tags=["layout"])
api_router.include_router(advisor_router, prefix="/advisor", tags=["advisor"])
