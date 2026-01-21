"""
Router for auxiliary endpoints (health, info, etc.)
"""
from fastapi import APIRouter
from app.dependencies import is_vision_available, is_auth_available
from app.config import settings


router = APIRouter(tags=["System"])


@router.get("/health")
async def health_check():
    """Server status"""
    return {
        "status": "healthy",
        "auth": "available" if is_auth_available() else "unavailable",
        "vision": "available" if is_vision_available() else "unavailable"
    }


@router.get("/")
async def root():
    """API information"""
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "auth": ["/auth/register", "/auth/login", "/auth/verify"],
            "vision": ["/vision/detect"]
        }
    }
