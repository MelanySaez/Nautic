# Nautic API

REST API with FastAPI for marine anomaly detection. Combines custom JWT authentication and image processing with YOLO.

## Project Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── app.py               # Main FastAPI application
│   ├── auth_manager.py      # Custom authentication manager
│   ├── config.py            # Centralized configuration
│   ├── models.py            # Pydantic models
│   ├── dependencies.py      # Shared dependencies
│   └── routers/
│       ├── __init__.py
│       ├── auth.py          # Authentication router
│       ├── vision.py        # Computer vision router
│       └── health.py        # System and health router
├── main.py                  # Entry point
├── requirements.txt
└── .env.example
```

## Dependencies

This project uses **nautic_core** library which includes:
- **Computer Vision**: YOLO model for marine anomaly detection
- **Ultralytics**: Included as dependency in nautic_core (no need to install separately)

The project also implements a **custom authentication system** (CustomAuthManager) that extends the core authentication functionality with user management capabilities.

The `requirements.txt` installs nautic_core from GitHub, which automatically includes all necessary dependencies like ultralytics, torch, etc.

### Important Note about Dependencies

The project uses **lazy imports** to avoid loading heavy ML dependencies (ultralytics, torch) until they are needed. This means:
- The API starts quickly
- Vision endpoints only load the model when first used
- All ML dependencies come from `nautic_core` - no need to install ultralytics separately

## Installation

1. Create virtual environment:
```bash
python -m venv .env
source .env/bin/activate  # Linux/Mac
# or
.env\Scripts\activate     # Windows
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

**Note**: The installation will take some time as it downloads the nautic_core library and all its dependencies (including ultralytics and torch). This is normal and only needs to be done once.

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your values
```

## Running the API

```bash
python main.py
```

The API will be available at:
- **API**: http://localhost:8000
- **Documentation**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

## Endpoints

### Authentication (`/auth`)
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login and get JWT token
- `GET /auth/verify` - Verify token validity

### Computer Vision (`/vision`)
- `POST /vision/detect` - Detect objects in image (requires auth)
- `POST /vision/predict-image-only` - Get annotated image with detections (requires auth)

### System
- `GET /` - API information
- `GET /health` - Server status

## Usage with Routers

Each functionality is organized in its own router:

- **auth.py**: Handles user registration, login, and verification using CustomAuthManager
- **vision.py**: Processes images and detects marine anomalies with YOLO
- **health.py**: System information and health check endpoints

To add new endpoints, create a new router in `app/routers/` and register it in `app/app.py`.

## Architecture

The API integrates the nautic_core library with custom components:

1. **CustomAuthManager** (app/auth_manager.py): Extends core authentication with user management
   - Inherits from: `core_engine.auth.AuthManager`
   - Adds user registration, validation, and storage
   - Loaded lazily when `get_auth_manager()` is called

2. **ImageProcessor**: Handles YOLO-based marine anomaly detection
   - Imported from: `core_engine.vision.image_processor.ImageProcessor`
   - Loaded lazily when `get_vision_processor()` is called
   - Automatically loads the YOLO model from the nautic_core package

The vision model auto-detects the model path from the installed package, so you don't need to configure it manually unless you want to use a custom model.

### Lazy Loading Implementation

The project uses Python's `TYPE_CHECKING` and lazy imports to defer loading of heavy dependencies:

```python
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core_engine.vision.image_processor import ImageProcessor

# Actual import happens only when needed
def get_vision_processor():
    from core_engine.vision.image_processor import ImageProcessor
    # ... rest of the code
```

This pattern ensures ultralytics and torch are only loaded when the vision service is actually used.

## Configuration

Environment variables are managed through `.env` file:

- `SECRET_KEY`: JWT secret key for token generation
- `ACCESS_TOKEN_EXPIRE_MINUTES`: Token expiration time (default: 60)
- Additional configuration in `app/config.py`

All configuration is centralized in `app/config.py` using Pydantic Settings for type safety and validation.
