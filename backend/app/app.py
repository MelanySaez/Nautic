"""
Main FastAPI application with Nautic Core
"""

from fastapi import FastAPI
from app.config import settings
from app.routers import auth, vision, health


def create_app() -> FastAPI:
    """Create and configure FastAPI application"""

    app = FastAPI(
        title="Nautic API",
        description=settings.app_description,
        version=settings.app_version,
    )

    # Include routers
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(vision.router)

    return app


app = create_app()
