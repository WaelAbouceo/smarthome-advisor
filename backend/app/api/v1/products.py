from fastapi import APIRouter
from app.repositories.product_repo import ProductRepository

router = APIRouter()
repo = ProductRepository()

@router.get("/catalog")
def get_catalog():
    return repo.get_catalog()
