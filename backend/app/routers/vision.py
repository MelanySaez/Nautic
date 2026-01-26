"""
Router for image processing with computer vision
"""

from fastapi import APIRouter, File, UploadFile, HTTPException, Depends, status
from fastapi.responses import StreamingResponse
from datetime import datetime
import io
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core_engine.vision.image_processor import ImageProcessor

from app.models import ImageProcessingResponse
from app.dependencies import verify_token, get_vision_processor, is_vision_available


router = APIRouter(prefix="/vision", tags=["Computer Vision"])


@router.post("/detect", response_model=ImageProcessingResponse)
async def detect_objects(
    file: UploadFile = File(...),
    payload: dict = Depends(verify_token),
    vision_processor: "ImageProcessor" = Depends(get_vision_processor),
):
    """
    Analyze an image with the marine anomaly detection model

    **Requires JWT authentication**

    The model detects the following classes:
    - sea_chest_grating, paint_peel, over_board_valve, defect, corrosion
    - propeller, anode, bilge_keel, marine_growth, ship_hull

    - **file**: image file (JPG, PNG, etc.)
    """
    if not is_vision_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Vision service not available",
        )

    try:
        # Lazy import PIL only when needed
        from PIL import Image

        # Read image
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        image_size = image.size

        print(f"Image received: {file.filename}, Size: {image_size}")

        # Run inference directly with PIL Image
        results = vision_processor.run_inference(image)

        print(f"Results: {results['detection_count']} detections")

        # Results are already in the correct model format
        return ImageProcessingResponse(
            timestamp=datetime.now().isoformat(),
            detections=results["detections"],
            detection_count=results["detection_count"],
            image_size=results["image_size"],
            inference_time_ms=results["inference_time_ms"],
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing image: {str(e)}",
        )


@router.post("/predict-image-only")
async def predict_image_only(
    file: UploadFile = File(...),
    confidence: float = 0.25,
    payload: dict = Depends(verify_token),
    vision_processor: "ImageProcessor" = Depends(get_vision_processor),
):
    """
    Process an image and return the annotated image with YOLO detections

    **Requires JWT authentication**

    - **file**: image file (JPG, PNG, etc.)
    - **confidence**: confidence threshold (0.0-1.0, default: 0.25)

    Returns:
    - Image with bounding boxes, labels and confidence drawn
    - Headers with detection information
    """
    if not is_vision_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Vision service not available",
        )

    try:
        # Read image as bytes
        contents = await file.read()

        print(f"Processing image: {file.filename}")
        print(f"Confidence threshold: {confidence}")

        # Temporarily adjust processor threshold
        original_threshold = vision_processor.confidence_threshold
        vision_processor.confidence_threshold = confidence

        # Process and annotate image with YOLO using package method
        annotated_image_bytes, results = await vision_processor.process_and_visualize(
            contents
        )

        # Restore original threshold
        vision_processor.confidence_threshold = original_threshold

        print(f"Detections found: {results['detection_count']}")
        print(f"Inference time: {results['inference_time_ms']:.2f}ms")

        # Prepare headers with detection information
        headers = {
            "X-Detection-Count": str(results["detection_count"]),
            "X-Inference-Time-Ms": str(results["inference_time_ms"]),
            "X-Image-Width": str(results["image_size"]["width"]),
            "X-Image-Height": str(results["image_size"]["height"]),
            "Content-Disposition": f"inline; filename=detected_{file.filename}",
        }

        # Return annotated image
        return StreamingResponse(
            io.BytesIO(annotated_image_bytes), media_type="image/jpeg", headers=headers
        )

    except Exception as e:
        print(f"❌ Error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing image: {str(e)}",
        )
