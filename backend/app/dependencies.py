"""
Shared dependencies for the API
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import TYPE_CHECKING, Optional
import os

# Lazy imports to avoid loading heavy ML dependencies until needed
if TYPE_CHECKING:
    from core_engine.auth import AuthManager
    from core_engine.vision.image_processor import ImageProcessor

from app.config import settings


# Security scheme
security = HTTPBearer()

# Global instance of authentication manager
_auth_manager = None
_vision_processor = None
_vision_available = None  # None = not checked yet
_auth_available = None


def get_auth_manager():
    """Get authentication manager instance"""
    global _auth_manager, _auth_available

    if _auth_manager is None:
        try:
            # Lazy import - only import when needed
            from core_engine.auth import AuthManager

            _auth_manager = AuthManager(
                secret_key=settings.secret_key,
                access_token_expire_minutes=settings.access_token_expire_minutes,
            )
            _auth_available = True
            print("✅ Auth manager initialized")
        except Exception as e:
            _auth_available = False
            print(f"⚠️  Auth manager not available: {e}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Authentication service not available: {str(e)}",
            )

    return _auth_manager


def get_vision_processor():
    """Get vision processor instance"""
    global _vision_processor, _vision_available

    if _vision_processor is None:
        try:
            # Lazy import to avoid loading ultralytics until needed
            from core_engine.vision.image_processor import ImageProcessor

            # If no model_path is configured, use the one from the package
            from pathlib import Path

            if settings.model_path:
                model_path = settings.model_path
            else:
                # Auto-detect the model from the installed package
                import core_engine

                package_path = Path(core_engine.__file__).parent
                model_path = str(package_path / "vision" / "best.pt")

            _vision_processor = ImageProcessor(model_path=model_path)
            _vision_available = True
            print(f"✅ Vision model loaded: {model_path}")
        except Exception as e:
            _vision_available = False
            print(f"⚠️  Vision model not available: {e}")

    return _vision_processor


def is_vision_available() -> bool:
    """
    Check if the vision service is available
    This is a lightweight check that doesn't actually load the model
    """
    global _vision_available

    # If we haven't checked yet, try a lightweight check
    if _vision_available is None:
        try:
            # Just check if the package exists, don't load it
            import importlib.util

            spec = importlib.util.find_spec("core_engine.vision")
            _vision_available = spec is not None
        except:
            _vision_available = False

    return _vision_available


def is_auth_available() -> bool:
    """Check if the authentication service is available"""
    global _auth_available

    if _auth_available is None:
        try:
            import importlib.util

            spec = importlib.util.find_spec("core_engine.auth")
            _auth_available = spec is not None
        except:
            _auth_available = False

    return _auth_available


async def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    auth_manager=Depends(get_auth_manager),
) -> dict:
    """
    Dependency to verify JWT token
    Returns the token payload if valid
    """
    token = credentials.credentials
    payload = auth_manager.verify_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload
