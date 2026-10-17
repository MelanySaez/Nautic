"""
Aplicación Celery del proyecto.

El broker (RabbitMQ por defecto) y demás parámetros se leen desde
``config.settings`` usando el prefijo ``CELERY_``.

Para arrancar un worker en desarrollo::

    celery -A config worker -Q vision -l info --concurrency=2 --pool=prefork
"""
import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("config")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
