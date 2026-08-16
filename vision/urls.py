from django.urls import path
from . import views

urlpatterns = [
    # Endpoint original — inferencia directa sin persistencia
    path('api/ai/anomalias/', views.api_ai_anomalias, name='api_ai_anomalias'),

    # Catálogo de secciones del casco
    path('api/vision/secciones/', views.api_vision_secciones, name='api_vision_secciones'),

    # Inspecciones (lista + creación)
    path('api/vision/inspecciones/', views.api_vision_inspecciones, name='api_vision_inspecciones'),

    # Detalle de inspección + sus fotos
    path('api/vision/inspecciones/<int:inspeccion_id>/', views.api_vision_inspeccion_detalle, name='api_vision_inspeccion_detalle'),

    # Subir foto a una inspección (dispara YOLO en background)
    path('api/vision/inspecciones/<int:inspeccion_id>/fotos/', views.api_vision_subir_foto, name='api_vision_subir_foto'),

    # Estado de una foto individual (polling) + análisis manual + eliminación
    path('api/vision/fotos/<int:foto_id>/', views.api_vision_foto_detalle, name='api_vision_foto_detalle'),

    # Disparar análisis YOLO para todas las fotos pendientes de una inspección
    path('api/vision/inspecciones/<int:inspeccion_id>/analizar/', views.api_vision_analizar_inspeccion, name='api_vision_analizar_inspeccion'),

    # Stream SSE de cambios de estado (reemplaza polling del frontend)
    path('api/vision/inspecciones/<int:inspeccion_id>/stream/', views.api_vision_inspeccion_stream, name='api_vision_inspeccion_stream'),
]
