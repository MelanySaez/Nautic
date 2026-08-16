from django.contrib import admin
from django.urls import path, include

from django.conf import settings
from django.conf.urls.static import static

from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('api.urls')),
    path('', include('vision.urls')),  # Módulo de visión artificial

    # Documentación automática (drf-spectacular)
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),                          # OpenAPI 3 YAML/JSON
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),   # Swagger UI
    path('api/docs/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),    # ReDoc
]

# ✅ Esto es CRUCIAL para que funcione MEDIA_URL en modo desarrollo
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
