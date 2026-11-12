from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.db import models, transaction
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

    # Who registered the vessel (null for vessels created before accounts existed).
    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='buques_creados',
    )
    created_at = models.DateTimeField(auto_now_add=True)  # ahora es timestamptz en PG
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'buques'

    def __str__(self):
        return self.nombre


class SeccionCasco(models.Model):
    """
    Zona física del casco de un buque.
    Cada buque declara las suyas al crearse (ver ``vision/secciones.py``);
    no dependen de ninguna inspección. ``codigo`` es único dentro del buque.
    """
    buque = models.ForeignKey(
        Buque,
        on_delete=models.CASCADE,
        related_name='secciones'
    )
    codigo = models.CharField(max_length=20)                    # ej: "FWD-BTM"
    nombre = models.CharField(max_length=100)                   # ej: "Fondo - Proa"
    descripcion = models.TextField(blank=True, default='')
    orden = models.IntegerField(default=0)                      # para ordenar en la UI

    class Meta:
        db_table = 'seccion_casco'
        ordering = ['orden', 'codigo']
        constraints = [
            models.UniqueConstraint(fields=['buque', 'codigo'], name='seccion_buque_codigo_uniq'),
        ]

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
    # Who created it: invites members, sets their permissions, makes it private,
    # deletes it and can hand over leadership (see ``vision/permisos.py``).
    lider = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='inspecciones_lideradas',
    )
    # Public inspections are readable by every signed-in user; private ones only
    # by their leader and members.
    privada = models.BooleanField(default=False)
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
    prefijo = f"Inspección #{inspeccion.pk} — "
    maximo = InspeccionCasco._meta.get_field('nombre').max_length
    buque = inspeccion.buque.nombre
    disponible = maximo - len(prefijo)
    if len(buque) > disponible:
        # A long vessel name must not push the value past the column size.
        buque = buque[:max(disponible - 1, 0)] + '…'
    return prefijo + buque


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
    # The row lock makes read + write one unit: a concurrent subir_severidad_max
    # from the worker waits here and then re-evaluates its condition against the
    # recomputed value, so a stale lower value can never overwrite it.
    with transaction.atomic():
        list(InspeccionCasco.objects.select_for_update().filter(pk=inspeccion_id).values_list('pk', flat=True))
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
    # Grouped detections live in ``DeteccionFoto`` (``foto.detecciones``), one row per class.
    # Storage key of the raw detections of the last analysis (one box and,
    # when the model produces it, one RLE mask per instance), kept as a JSON
    # file next to the photos because masks are too heavy for a column.
    detecciones_archivo = models.CharField(max_length=500, blank=True, null=True)
    tiempo_inferencia_ms = models.FloatField(null=True, blank=True)
    severidad = models.CharField(max_length=20, null=True, blank=True)  # critical/high/medium/low
    estado = models.CharField(
        max_length=20,
        choices=Estado.choices,
        default=Estado.PENDIENTE
    )
    error_detalle = models.TextField(blank=True, null=True)
    # Id del modelo de core_engine con el que se analizó (o se va a analizar)
    # la foto. Se fija al disparar el análisis; null mientras nunca se pidió.
    modelo_id = models.CharField(max_length=50, blank=True, null=True)
    # Versions reported by core_engine's analyze() for the last completed
    # analysis: weights/model version and detection-taxonomy version. They let
    # a weights or taxonomy update be traced per photo. Null for photos analyzed
    # before they were recorded, or not analyzed yet.
    modelo_version = models.CharField(max_length=32, blank=True, null=True)
    taxonomia_version = models.CharField(max_length=32, blank=True, null=True)
    # Inspector's note for the report (see ``vision/reporte.py``).
    nota_inspector = models.TextField(blank=True, default='')
    # Who uploaded the photo.
    subida_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='fotos_subidas',
    )
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


class ReporteInspeccion(models.Model):
    """
    Editable draft of an inspection's report: the inspector's texts.
    Created on the first save; the PDF is generated from it (see ``vision/reporte.py``).
    """
    inspeccion = models.OneToOneField(
        InspeccionCasco,
        on_delete=models.CASCADE,
        related_name='reporte',
    )
    conclusion = models.TextField(blank=True, default='')
    observaciones = models.TextField(blank=True, default='')
    recomendaciones = models.TextField(blank=True, default='')
    inspector_nombre = models.CharField(max_length=255, blank=True, default='')
    inspector_cargo = models.CharField(max_length=255, blank=True, default='')
    # Who saved the draft last.
    revisado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    fecha_modificacion = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'reporte_inspeccion'

    def __str__(self):
        return f"Reporte de la inspección #{self.inspeccion_id}"


class DeteccionFoto(models.Model):
    """
    One detected class in one photo: how many instances the model found and
    its highest confidence (the boxes and masks stay in ``detecciones_archivo``).
    ``descartada`` marks a false positive dismissed by the inspector for the
    report; a new analysis replaces the photo's rows.
    """
    foto = models.ForeignKey(
        FotoInspeccion,
        on_delete=models.CASCADE,
        related_name='detecciones',
    )
    clase = models.CharField(max_length=64)          # taxonomy class name, e.g. "corrosion"
    cantidad = models.PositiveIntegerField()
    confianza_max = models.FloatField()
    descartada = models.BooleanField(default=False)
    # Who last confirmed or discarded this finding in the report.
    validado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )

    class Meta:
        db_table = 'deteccion_foto'
        ordering = ['id']  # the order the analysis reported the classes in
        constraints = [
            models.UniqueConstraint(fields=['foto', 'clase'], name='deteccion_foto_clase_uniq'),
        ]
        indexes = [
            models.Index(fields=['clase', 'foto'], name='deteccion_clase_foto_idx'),
        ]

    def __str__(self):
        return f"{self.clase} ×{self.cantidad} — foto #{self.foto_id}"


def resumen_detecciones(foto):
    """
    The photo's detections in the API shape ``[{class_name, count, max_confidence}]``.

    ``None`` while the photo has never been analyzed, ``[]`` when it was analyzed
    and nothing was found (also while it is re-queued: ``detecciones_archivo`` marks
    a past analysis). Uses prefetched rows when present.
    """
    filas = list(foto.detecciones.all())
    analizada = foto.estado == FotoInspeccion.Estado.COMPLETADA or bool(foto.detecciones_archivo)
    if not filas and not analizada:
        return None
    return [
        {'class_name': f.clase, 'count': f.cantidad, 'max_confidence': f.confianza_max}
        for f in filas
    ]


class InspeccionMiembro(models.Model):
    """
    A user invited by the inspection's leader, with the permissions they hold.
    ``rol`` names the template the permissions came from, or ``personalizado``
    when the leader adjusted them (see ``ROLES``).
    """
    class Rol(models.TextChoices):
        COLABORADOR = 'colaborador', 'Colaborador'
        REVISOR = 'revisor', 'Revisor'
        OBSERVADOR = 'observador', 'Observador'
        PERSONALIZADO = 'personalizado', 'Personalizado'

    PERMISOS = ('subir_fotos', 'analizar', 'editar_reporte', 'editar_inspeccion')
    # Template roles -> the permissions they grant.
    ROLES = {
        Rol.COLABORADOR: {'subir_fotos': True, 'analizar': True, 'editar_reporte': True, 'editar_inspeccion': True},
        Rol.REVISOR: {'subir_fotos': False, 'analizar': False, 'editar_reporte': True, 'editar_inspeccion': False},
        Rol.OBSERVADOR: {'subir_fotos': False, 'analizar': False, 'editar_reporte': False, 'editar_inspeccion': False},
    }

    inspeccion = models.ForeignKey(InspeccionCasco, on_delete=models.CASCADE, related_name='miembros')
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='membresias')
    rol = models.CharField(max_length=20, choices=Rol.choices)
    puede_subir_fotos = models.BooleanField(default=False)
    puede_analizar = models.BooleanField(default=False)
    puede_editar_reporte = models.BooleanField(default=False)
    puede_editar_inspeccion = models.BooleanField(default=False)
    agregado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    fecha_agregado = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'inspeccion_miembro'
        ordering = ['fecha_agregado', 'id']
        constraints = [
            models.UniqueConstraint(fields=['inspeccion', 'usuario'], name='miembro_inspeccion_usuario_uniq'),
        ]

    def __str__(self):
        return f"{self.usuario} — {self.rol} en la inspección #{self.inspeccion_id}"

    def permisos(self):
        return {p: getattr(self, f'puede_{p}') for p in self.PERMISOS}

    def asignar(self, permisos):
        """Set the four permissions and derive ``rol`` (a template, or ``personalizado``)."""
        for permiso in self.PERMISOS:
            setattr(self, f'puede_{permiso}', bool(permisos[permiso]))
        actuales = self.permisos()
        self.rol = next((rol for rol, plantilla in self.ROLES.items() if plantilla == actuales),
                        self.Rol.PERSONALIZADO)
