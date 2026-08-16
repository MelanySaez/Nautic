from django.db import models


class SeccionCasco(models.Model):
    """
    Catálogo genérico de zonas físicas del casco.
    Aplica a cualquier buque — no depende de ninguna inspección.
    """
    codigo = models.CharField(max_length=20, unique=True)       # ej: "FWD-BTM"
    nombre = models.CharField(max_length=100)                   # ej: "Fondo - Proa"
    descripcion = models.TextField(blank=True, default='')
    orden = models.IntegerField(default=0)                      # para ordenar en la UI

    class Meta:
        db_table = 'seccion_casco'
        ordering = ['orden', 'codigo']

    def __str__(self):
        return f"{self.codigo} — {self.nombre}"


class InspeccionCasco(models.Model):
    """
    Sesión de inspección: agrupa todas las fotos tomadas
    en una misma campaña de revisión de un buque.
    """
    buque = models.ForeignKey(
        'api.Buque',
        on_delete=models.CASCADE,
        related_name='inspecciones_casco'
    )
    descripcion = models.TextField(blank=True, default='')
    tomado_por = models.CharField(max_length=255, blank=True, default='')
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_modificacion = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'inspeccion_casco'
        ordering = ['-fecha_creacion']

    def __str__(self):
        return f"Inspección #{self.pk} — {self.buque} ({self.fecha_creacion.date()})"


class FotoInspeccion(models.Model):
    """
    Foto individual analizada por el modelo YOLO.
    Responde dos preguntas: ¿en qué inspección? (FK inspeccion)
    y ¿dónde del casco? (FK seccion).
    El procesamiento es asíncrono: la foto se crea con estado='pendiente'
    y el worker actualiza imagen_anotada, detecciones y estado al terminar.
    """

    class Estado(models.TextChoices):
        PENDIENTE = 'pendiente', 'Pendiente'
        EN_PROCESO = 'en_proceso', 'En proceso'
        COMPLETADA = 'completada', 'Completada'
        ERROR = 'error', 'Error'

    inspeccion = models.ForeignKey(
        InspeccionCasco,
        on_delete=models.CASCADE,
        related_name='fotos'
    )
    seccion = models.ForeignKey(
        SeccionCasco,
        on_delete=models.PROTECT,
        related_name='fotos'
    )
    imagen_original = models.CharField(max_length=500)
    imagen_anotada = models.CharField(max_length=500, blank=True, null=True)
    # Clases detectadas — una entrada por clase única:
    # [{"class_name": "corrosion", "count": 2, "max_confidence": 0.92}, ...]
    detecciones = models.JSONField(null=True, blank=True)
    tiempo_inferencia_ms = models.FloatField(null=True, blank=True)
    severidad = models.CharField(max_length=20, null=True, blank=True)  # critical/high/medium/low
    estado = models.CharField(
        max_length=20,
        choices=Estado.choices,
        default=Estado.PENDIENTE
    )
    error_detalle = models.TextField(blank=True, null=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'foto_inspeccion'
        ordering = ['fecha_creacion']
        indexes = [
            models.Index(fields=['inspeccion', 'estado']),
            models.Index(fields=['seccion']),
        ]

    def __str__(self):
        return f"Foto #{self.pk} [{self.estado}] — {self.seccion.codigo} / Insp.{self.inspeccion_id}"
