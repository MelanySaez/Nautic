from django.contrib.postgres.indexes import GinIndex
from django.db import models
from django.db.models import Q


class NivelSeveridad(models.IntegerChoices):
    """
    Severidad ordenada numéricamente para poder filtrar y ordenar en SQL.
    Las etiquetas coinciden con los valores de texto de
    ``FotoInspeccion.severidad`` (ver ``tasks._calcular_severidad``).
    """
    LOW = 1, 'low'
    MEDIUM = 2, 'medium'
    HIGH = 3, 'high'
    CRITICAL = 4, 'critical'

    @classmethod
    def desde_texto(cls, texto):
        """'high' -> 3. Devuelve None si el texto no es un nivel conocido."""
        for nivel in cls:
            if nivel.label == texto:
                return nivel.value
        return None

    @classmethod
    def a_texto(cls, valor):
        """3 -> 'high'. Devuelve None para None o valores desconocidos."""
        if valor is None:
            return None
        try:
            return cls(valor).label
        except ValueError:
            return None


class Buque(models.Model):
    nombre = models.CharField(max_length=255)
    tipo = models.CharField(max_length=255)
    descripcion = models.TextField(blank=True, default='')
    autonomia_horas = models.IntegerField(null=True, blank=True)
    vida_diseno_anios = models.IntegerField(null=True, blank=True)
    horas_navegacion_anio = models.IntegerField(null=True, blank=True)
    imagen = models.CharField(max_length=255, null=True, blank=True)
    etapa = models.CharField(max_length=255, default='Activo')

    # Configuración y documentos del buque (JSON)
    rondas_config = models.JSONField(default=dict, blank=True)
    documentos    = models.JSONField(default=list, blank=True)

    # Ficha técnica
    vel_maxima_nudos = models.FloatField(null=True, blank=True)
    autonomia_dias = models.IntegerField(null=True, blank=True)
    alcance_nm_a_12kn = models.FloatField(null=True, blank=True)
    eslora_total_m = models.FloatField(null=True, blank=True)
    manga_moldeada_m = models.FloatField(null=True, blank=True)
    puntal_m = models.FloatField(null=True, blank=True)
    calado_diseno_m = models.FloatField(null=True, blank=True)
    desplazamiento_ton = models.FloatField(null=True, blank=True)
    combustible_diario_m3 = models.FloatField(null=True, blank=True)
    combustible_diesel_m3 = models.FloatField(null=True, blank=True)
    combustible_helicoptero_m3 = models.FloatField(null=True, blank=True)
    gasolina_botes_m3 = models.FloatField(null=True, blank=True)
    agua_potable_m3 = models.FloatField(null=True, blank=True)
    aceite_lubricante_m3 = models.FloatField(null=True, blank=True)
    aceite_hidraulico_m3 = models.FloatField(null=True, blank=True)

    # Contexto operacional
    contexto_operacional = models.JSONField(default=dict, blank=True)

    misiones = models.JSONField(default=list, blank=True)

    # Grupos constructivos SWBS configurables
    grupos_constructivos = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)  # ahora es timestamptz en PG
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'buques'

    def __str__(self):
        return self.nombre


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
        Buque,
        on_delete=models.CASCADE,
        related_name='inspecciones_casco'
    )
    # Si queda vacío al crear, la vista genera "Inspección #<id> — <buque>".
    nombre = models.CharField(max_length=255, blank=True, default='')
    # Peor severidad entre las fotos completadas (desnormalizada para filtrar).
    severidad_max = models.PositiveSmallIntegerField(
        null=True, blank=True, choices=NivelSeveridad.choices,
    )
    descripcion = models.TextField(blank=True, default='')
    tomado_por = models.CharField(max_length=255, blank=True, default='')
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_modificacion = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'inspeccion_casco'
        ordering = ['-fecha_creacion']
        indexes = [
            models.Index(fields=['buque', '-fecha_creacion', '-id'], name='insp_buque_fecha_idx'),
            models.Index(fields=['severidad_max', '-fecha_creacion', '-id'], name='insp_sev_fecha_idx'),
            models.Index(fields=['-fecha_creacion', '-id'], name='insp_fecha_idx'),
            # Sirve el filtro q (lookup contiene_ilike → ILIKE '%...%', ver busqueda.py).
            GinIndex(fields=['nombre'], opclasses=['gin_trgm_ops'], name='insp_nombre_trgm_idx'),
        ]

    def __str__(self):
        return f"Inspección #{self.pk} — {self.buque} ({self.fecha_creacion.date()})"


def nombre_por_defecto(inspeccion):
    """Nombre generado cuando el usuario no da uno: ``Inspección #<id> — <buque>``."""
    return f"Inspección #{inspeccion.pk} — {inspeccion.buque.nombre}"


def subir_severidad_max(inspeccion_id, nivel):
    """
    Sube ``severidad_max`` a ``nivel`` (int) con un UPDATE condicional: es
    atómico y nunca la baja, así que es seguro con workers concurrentes.
    Devuelve True si cambió alguna fila.
    """
    if nivel is None:
        return False
    filas = InspeccionCasco.objects.filter(pk=inspeccion_id).filter(
        Q(severidad_max__isnull=True) | Q(severidad_max__lt=nivel)
    ).update(severidad_max=nivel)
    return filas > 0


def recalcular_severidad_max(inspeccion_id):
    """
    Recalcula ``severidad_max`` desde las fotos completadas que quedan
    (se usa al borrar una foto). Devuelve el nuevo valor (int o None).
    """
    textos = FotoInspeccion.objects.filter(
        inspeccion_id=inspeccion_id,
        estado=FotoInspeccion.Estado.COMPLETADA,
        severidad__isnull=False,
    ).values_list('severidad', flat=True).distinct()
    niveles = [n for n in map(NivelSeveridad.desde_texto, textos) if n is not None]
    nuevo = max(niveles) if niveles else None
    InspeccionCasco.objects.filter(pk=inspeccion_id).update(severidad_max=nuevo)
    return nuevo


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
