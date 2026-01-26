"""
Application configuration
"""

from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application configuration"""

    # API
    app_name: str = "Nautic API"
    app_version: str = "1.0.0"
    app_description: str = "Authentication and image processing API"

    # Security
    secret_key: str = "your-very-secure-secret-key-change-in-production"
    access_token_expire_minutes: int = 60

    # Vision - uses the model from the nautic-core package
    model_path: Optional[str] = None  # Auto-detected from package

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    reload: bool = True

    class Config:
        env_file = ".env"


settings = Settings()
