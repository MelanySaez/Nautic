#!/usr/bin/env python3
import time
from typing import Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
import argostranslate.package
import argostranslate.translate


# Global variable to track Argos installation status
argos_installed = False


def setup_argos_translate(from_code: str = "en", to_code: str = "es"):
    """Setup Argos Translate package for the specified language pair."""
    global argos_installed
    try:
        print(f"Setting up Argos Translate for {from_code} to {to_code}...")

        # Update package index
        argostranslate.package.update_package_index()

        # Check if package is already installed
        installed_packages = argostranslate.package.get_installed_packages()
        if any(
            pkg.from_code == from_code and pkg.to_code == to_code
            for pkg in installed_packages
        ):
            print(f"Package {from_code} -> {to_code} already installed")
            argos_installed = True
            return

        # Get available packages
        available_packages = argostranslate.package.get_available_packages()
        package_to_install = next(
            filter(
                lambda x: x.from_code == from_code and x.to_code == to_code,
                available_packages,
            ),
            None,
        )

        if not package_to_install:
            raise Exception(
                f"No translation package found for {from_code} to {to_code}"
            )

        # Install the package
        print(f"Installing package: {package_to_install}")
        argostranslate.package.install_from_path(package_to_install.download())

        # Verify installation
        installed_packages = argostranslate.package.get_installed_packages()
        if any(
            pkg.from_code == from_code and pkg.to_code == to_code
            for pkg in installed_packages
        ):
            argos_installed = True
            print("Argos Translate package installed successfully!")
        else:
            raise Exception("Package installation verification failed")

    except Exception as e:
        print(f"Error setting up Argos Translate: {e}")
        argos_installed = False
        raise e


def translate_text_argos(text: str, from_code: str = "en", to_code: str = "es") -> str:
    """Translate text using Argos Translate."""
    if not argos_installed:
        raise HTTPException(status_code=500, detail="Argos Translate not installed")

    # Validate input text
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    try:
        # Check if translation package is available
        available_packages = argostranslate.package.get_installed_packages()
        package_found = any(
            pkg.from_code == from_code and pkg.to_code == to_code
            for pkg in available_packages
        )

        if not package_found:
            raise HTTPException(
                status_code=500,
                detail=f"Translation package for {from_code} to {to_code} not found. Please install it first.",
            )

        # Perform translation
        translated_text = argostranslate.translate.translate(text, from_code, to_code)

        # Check if translation returned None
        if translated_text is None:
            raise HTTPException(
                status_code=500,
                detail="Translation failed - received None result. Check if language models are properly installed.",
            )

        return translated_text
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Argos translation error: {str(e)}"
        ) from e


def simple_fallback_translate(
    text: str, from_code: str = "en", to_code: str = "es"
) -> str:
    """Simple fallback translation for common Spanish-English pairs."""
    # Very basic word mapping for common terms
    if from_code == "es" and to_code == "en":
        basic_translations = {
            "hola": "hello",
            "gracias": "thank you",
            "por favor": "please",
            "sí": "yes",
            "no": "no",
            "buenos días": "good morning",
            "buenas tardes": "good afternoon",
            "buenas noches": "good evening",
            "adiós": "goodbye",
            "cómo estás": "how are you",
            "bien": "good",
            "mal": "bad",
            "agua": "water",
            "comida": "food",
            "casa": "house",
            "trabajo": "work",
            "tiempo": "time",
            "día": "day",
            "noche": "night",
            "mañana": "morning",
        }

        text_lower = text.lower().strip()
        if text_lower in basic_translations:
            return basic_translations[text_lower]

    # If no translation found, return original text with a note
    return f"[Translation failed] {text}"


# Pydantic models for request/response


class ArgosTranslationRequest(BaseModel):
    text: str
    from_code: str = "en"
    to_code: str = "es"
    show_time: Optional[bool] = False


class TranslationResponse(BaseModel):
    output: str
    execution_time: Optional[float] = None
    model_used: str


# FastAPI app
app = FastAPI(
    title="Argos Translation API",
    description="API for translating text using Argos Translate",
    version="1.0.0",
)


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "message": "Argos Translation API",
        "endpoints": {
            "translate": "/translate",
            "health": "/health",
            "docs": "/docs",
        },
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "argos_installed": argos_installed,
    }


@app.post("/translate", response_model=TranslationResponse)
async def translate(request: ArgosTranslationRequest):
    """
    Translate text using Argos Translate.

    - **text**: The text to translate
    - **from_code**: Source language code (default: "en")
    - **to_code**: Target language code (default: "es")
    - **show_time**: Whether to include execution time in response (optional)
    """
    try:
        start_time = time.time()
        translated_text = None
        model_used = ""

        # Try Argos Translate first
        try:
            # Setup Argos Translate if not already installed
            if not argos_installed:
                setup_argos_translate(request.from_code, request.to_code)

            translated_text = translate_text_argos(
                request.text, request.from_code, request.to_code
            )
            model_used = f"Argos Translate ({request.from_code} -> {request.to_code})"

        except Exception as argos_error:
            print(f"Argos translation failed: {argos_error}")
            # Fallback to simple translation
            translated_text = simple_fallback_translate(
                request.text, request.from_code, request.to_code
            )
            model_used = f"Simple Fallback ({request.from_code} -> {request.to_code})"

        end_time = time.time()
        execution_time = end_time - start_time

        response_data = {
            "output": translated_text,
            "model_used": model_used,
        }

        if request.show_time:
            response_data["execution_time"] = round(execution_time, 4)

        return TranslationResponse(**response_data)

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Unexpected error: {str(e)}"
        ) from e


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
