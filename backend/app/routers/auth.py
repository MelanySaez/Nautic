"""
Authentication router
"""

from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPAuthorizationCredentials
from app.models import UserRegister, UserLogin, TokenResponse
from app.dependencies import get_auth_manager, security
from app.auth_manager import CustomAuthManager


router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=TokenResponse)
async def register(
    user: UserRegister, auth_manager: CustomAuthManager = Depends(get_auth_manager)
):
    """
    Register a new user

    - **username**: unique username
    - **password**: secure password
    """
    try:
        # Create user
        auth_manager.create_user(user.username, user.password)

        # Generate token automatically
        token = auth_manager.authenticate_user(user.username, user.password)

        return {"access_token": token, "token_type": "bearer", "expires_in": 3600}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/login", response_model=TokenResponse)
async def login(
    user: UserLogin, auth_manager: CustomAuthManager = Depends(get_auth_manager)
):
    """
    User login and get JWT token

    - **username**: username
    - **password**: password
    """
    token = auth_manager.authenticate_user(user.username, user.password)

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )

    return {"access_token": token, "token_type": "bearer", "expires_in": 3600}


@router.get("/verify")
async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Verify that the JWT token is valid
    """
    auth_manager = get_auth_manager()
    token = credentials.credentials
    payload = auth_manager.verify_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        )

    return {
        "valid": True,
        "username": payload.get("sub"),
        "expires_at": payload.get("exp"),
    }
