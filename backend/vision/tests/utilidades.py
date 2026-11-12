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


def cliente_admin():
    """An API client signed in as a superuser: for tests about behavior, not permissions
    (those live in ``test_permisos.py``)."""
    from django.contrib.auth import get_user_model
    from rest_framework.test import APIClient

    Usuario = get_user_model()
    admin = Usuario.objects.filter(email='admin@pruebas.local').first() or Usuario.objects.create_superuser(
        'admin@pruebas.local', None, nombre='Admin de pruebas',  # no password: hashing is slow
    )
    cliente = APIClient()
    cliente.force_authenticate(admin)
    return cliente


def cliente_admin_sin_bd():
    """Like ``cliente_admin`` for ``SimpleTestCase``: an unsaved superuser, for endpoints that never query users."""
    from django.contrib.auth import get_user_model
    from rest_framework.test import APIClient

    cliente = APIClient()
    cliente.force_authenticate(get_user_model()(email='admin@pruebas.local', is_superuser=True))
    return cliente
