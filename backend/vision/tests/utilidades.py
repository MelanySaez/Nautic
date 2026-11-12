"""Shared test helpers."""
import io

from PIL import Image

# Replaces the default storage with an in-memory one, so tests never touch the
# disk or a bucket. Use with ``override_settings(STORAGES=STORAGES_EN_MEMORIA)``.
STORAGES_EN_MEMORIA = {
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}


def png_bytes(lado=4):
    """A valid PNG as bytes."""
    buffer = io.BytesIO()
    Image.new('RGB', (lado, lado)).save(buffer, format='PNG')
    return buffer.getvalue()


def crear_foto(detecciones=None, **campos):
    """A ``FotoInspeccion`` plus its ``DeteccionFoto`` rows, from the grouped API shape
    ``[{class_name, count, max_confidence}]``."""
    from vision.models import DeteccionFoto, FotoInspeccion

    foto = FotoInspeccion.objects.create(**campos)
    DeteccionFoto.objects.bulk_create([
        DeteccionFoto(foto=foto, clase=d['class_name'], cantidad=d['count'], confianza_max=d['max_confidence'])
        for d in detecciones or []
    ])
    return foto
