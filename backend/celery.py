"""
Aplicación Celery del proyecto.

El broker (RabbitMQ por defecto) y demás parámetros se leen desde
``backend.settings`` usando el prefijo ``CELERY_``.

Para arrancar un worker en desarrollo::

    celery -A backend worker -Q vision -l info --concurrency=2 --pool=prefork
"""
import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

app = Celery("backend")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
