from django.apps import AppConfig
from django.core import checks


@checks.register()
def _check_configuracion_vision(app_configs, **kwargs):
    """System check: valida NAUTIC_WEIGHTS_DIR y VISION_MODEL_ID al arrancar."""
    from .inference import verificar_configuracion

    return [
        checks.Error(error, id="vision.E001")
        for error in verificar_configuracion()
    ]


class VisionConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "vision"
    verbose_name = "Vision Artificial"
