"""
Ejemplo de API REST con FastAPI usando Nautic Core
Combina autenticación JWT y procesamiento de imágenes con YOLO

Instalación de dependencias:
    pip install fastapi uvicorn python-multipart pillow

Ejecución:
    python api_example.py

Luego accede a:
    http://localhost:8000/docs
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime
import io
from PIL import Image

from core_engine.auth import AuthManager
from core_engine.vision.image_processor import ImageProcessor

# ==================== CONFIGURACIÓN ====================

app = FastAPI(
    title="Nautic Core API",
    description="API de autenticación y procesamiento de imágenes",
    version="1.0.0"
)

# Inicializar gestor de autenticación
auth_manager = AuthManager(
    secret_key="tu-clave-secreta-muy-segura-cambiar-en-produccion",
    algorithm="HS256",
    access_token_expire_minutes=60
)

# Inicializar procesador de visión (ajusta la ruta del modelo si es necesario)
try:
    vision_processor = ImageProcessor(
        confidence_threshold=0.25,  # Threshold más bajo para ver más detecciones
        iou_threshold=0.45
    )
    VISION_AVAILABLE = True
except Exception as e:
    print(f"⚠️  Modelo de visión no disponible: {e}")
    VISION_AVAILABLE = False

# Esquema de seguridad
security = HTTPBearer()

# ==================== MODELOS ====================

class UserRegister(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int

class Detection(BaseModel):
    class_id: int
    class_name: str
    confidence: float
    bbox: Dict[str, float]  # {x1, y1, x2, y2, x_center, y_center, width, height}
    bbox_normalized: Dict[str, float]  # normalized coordinates

class ImageProcessingResponse(BaseModel):
    timestamp: str
    detections: List[Detection]
    detection_count: int
    image_size: Dict[str, int]  # {width, height}
    inference_time_ms: float

class UserProfile(BaseModel):
    username: str
    created_at: str

# ==================== RUTAS DE AUTENTICACIÓN ====================

@app.post("/auth/register", response_model=TokenResponse)
async def register(user: UserRegister):
    """
    Registrar un nuevo usuario

    - **username**: nombre de usuario único
    - **password**: contraseña segura
    """
    try:
        # Crear usuario
        auth_manager.create_user(user.username, user.password)

        # Generar token automáticamente
        token = auth_manager.authenticate_user(user.username, user.password)

        return {
            "access_token": token,
            "token_type": "bearer",
            "expires_in": 3600
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@app.post("/auth/login", response_model=TokenResponse)
async def login(user: UserLogin):
    """
    Login de usuario y obtener token JWT

    - **username**: nombre de usuario
    - **password**: contraseña
    """
    token = auth_manager.authenticate_user(user.username, user.password)

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas"
        )

    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": 3600
    }

@app.get("/auth/verify")
async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Verificar que el token JWT sea válido
    """
    token = credentials.credentials
    payload = auth_manager.verify_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado"
        )

    return {
        "valid": True,
        "username": payload.get("sub"),
        "expires_at": payload.get("exp")
    }

# ==================== RUTAS DE VISIÓN ====================

@app.post("/vision/detect")
async def detect_objects(
    file: UploadFile = File(...),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Procesar una imagen y retornar la imagen anotada con detecciones YOLO

    **Requiere autenticación JWT**

    - **file**: archivo de imagen (JPG, PNG, etc.)

    Retorna:
    - Imagen con bounding boxes, etiquetas y confianza dibujadas
    - Headers con información de detecciones
    """

    # Verificar token
    token = credentials.credentials
    payload = auth_manager.verify_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado"
        )

    if not VISION_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Servicio de visión no disponible"
        )

    try:
        # Leer imagen como bytes
        contents = await file.read()

        # Procesar y anotar imagen con YOLO
        annotated_image_bytes, results = await vision_processor.process_and_visualize(contents)

        # Preparar headers con información de detecciones
        headers = {
            "X-Detection-Count": str(results['detection_count']),
            "X-Inference-Time-Ms": str(results['inference_time_ms']),
            "X-Image-Width": str(results['image_size']['width']),
            "X-Image-Height": str(results['image_size']['height'])
        }

        # Retornar imagen anotada
        return StreamingResponse(
            io.BytesIO(annotated_image_bytes),
            media_type="image/jpeg",
            headers=headers
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error procesando imagen: {str(e)}"
        )

# ==================== RUTAS AUXILIARES ====================

@app.get("/health")
async def health_check():
    """Estado del servidor"""
    return {
        "status": "healthy",
        "auth": "available",
        "vision": "available" if VISION_AVAILABLE else "unavailable"
    }

@app.get("/")
async def root():
    """Información de la API"""
    return {
        "name": "Nautic Core API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "auth": ["/auth/register", "/auth/login", "/auth/verify"],
            "vision": ["/vision/detect"]
        }
    }

# ==================== EJECUCIÓN ====================

if __name__ == "__main__":
    import uvicorn

    print("\n" + "="*50)
    print("Nautic Core API")
    print("="*50)
    print("Accede a: http://localhost:8000")
    print("Docs:     http://localhost:8000/docs")
    print("="*50 + "\n")

    uvicorn.run(
        "api_example:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )