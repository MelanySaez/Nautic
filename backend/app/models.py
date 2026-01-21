"""
Pydantic models for the API
"""
from pydantic import BaseModel
from typing import List, Optional


# ==================== AUTHENTICATION MODELS ====================

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


class UserProfile(BaseModel):
    username: str
    created_at: str


# ==================== VISION MODELS ====================

class Detection(BaseModel):
    class_id: int
    class_name: str
    confidence: float
    bbox: dict  # {x1, y1, x2, y2, x_center, y_center, width, height}
    bbox_normalized: dict  # normalized coordinates


class ImageProcessingResponse(BaseModel):
    timestamp: str
    detections: List[Detection]
    detection_count: int
    image_size: dict  # {width, height}
    inference_time_ms: float
