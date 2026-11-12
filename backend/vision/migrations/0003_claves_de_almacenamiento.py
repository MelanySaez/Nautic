from django.db import migrations
from django.db.models.functions import Concat, Substr
from django.db.models import Value

PREFIJO = 'media/'
CAMPOS = ('imagen_original', 'imagen_anotada')


def quitar_prefijo_media(apps, schema_editor):
    """Turn legacy ``media/<key>`` paths into storage keys (``<key>``).

    Photos are now addressed through Django's storage API relative to the
    storage root (``MEDIA_ROOT`` locally), so the ``media/`` prefix must go.
    """
    Foto = apps.get_model('vision', 'FotoInspeccion')
    for campo in CAMPOS:
        Foto.objects.filter(**{f'{campo}__startswith': PREFIJO}).update(
            # Substr is 1-indexed: keep everything after the prefix.
            **{campo: Substr(campo, len(PREFIJO) + 1)}
        )


def restaurar_prefijo_media(apps, schema_editor):
    """Inverse: prepend ``media/`` to every non-empty key that lacks it."""
    Foto = apps.get_model('vision', 'FotoInspeccion')
    for campo in CAMPOS:
        (
            Foto.objects
            .filter(**{f'{campo}__isnull': False})
            .exclude(**{campo: ''})
            .exclude(**{f'{campo}__startswith': PREFIJO})
            .update(**{campo: Concat(Value(PREFIJO), campo)})
        )


class Migration(migrations.Migration):

    dependencies = [
        ('vision', '0002_inspeccion_nombre_severidad'),
    ]

    operations = [
        migrations.RunPython(quitar_prefijo_media, restaurar_prefijo_media),
    ]
