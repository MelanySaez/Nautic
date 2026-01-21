"""
Entry point to run the API with Uvicorn
Run with: python main.py
"""

if __name__ == "__main__":
    import uvicorn
    from app.config import settings

    print("\n" + "="*50)
    print("Nautic Core API")
    print("="*50)
    print(f"Access at: http://{settings.host}:{settings.port}")
    print(f"Docs:      http://{settings.host}:{settings.port}/docs")
    print("="*50 + "\n")

    uvicorn.run(
        "app.app:app",
        host=settings.host,
        port=settings.port,
        reload=settings.reload
    )
