"""Validation shared by every image upload (inspection photos, vessel images)."""
import os

from PIL import Image

EXTENSIONES_PERMITIDAS = {'.jpg', '.jpeg', '.png', '.bmp', '.webp', '.tiff', '.tif'}
TIPOS_PERMITIDOS = {'image/jpeg', 'image/png', 'image/bmp', 'image/webp', 'image/tiff'}


def validar_imagen(archivo):
    """
    Check that an uploaded file is a real image.
    Returns (ok: bool, error_msg: str|None).
    """
    # 1. Extension.
    extension = os.path.splitext(archivo.name)[1].lower()
    if extension not in EXTENSIONES_PERMITIDAS:
        return False, f'Extensión no permitida: {extension}. Aceptadas: {", ".join(sorted(EXTENSIONES_PERMITIDAS))}'

    # 2. Content type declared by the browser.
    if archivo.content_type and archivo.content_type not in TIPOS_PERMITIDOS:
        return False, f'Tipo de archivo no permitido: {archivo.content_type}'

    # 3. PIL must open it (magic bytes), without decoding it fully.
    try:
        archivo.seek(0)
        Image.open(archivo).verify()
        archivo.seek(0)  # Rewind for the storage write.
    except Exception:
        return False, 'El archivo no es una imagen válida o está corrupto.'

    return True, None
