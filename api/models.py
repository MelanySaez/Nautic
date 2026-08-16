# models.py - Version LITE
from django.db import models
from django.contrib.postgres.indexes import GinIndex

class Grupo(models.Model):
    numero_de_referencia = models.IntegerField(unique=True)
    descripcion = models.TextField()
    class Meta: db_table = 'grupos'
    def __str__(self): return f"{self.numero_de_referencia} - {self.descripcion}"

class Subgrupo(models.Model):
    grupo = models.ForeignKey(Grupo, on_delete=models.CASCADE)
    numero_de_referencia = models.IntegerField(unique=True)
    descripcion = models.TextField()
    class Meta: db_table = 'subgrupos'
    def __str__(self): return f"{self.numero_de_referencia} - {self.descripcion}"

class Sistema(models.Model):
    subgrupo = models.ForeignKey(Subgrupo, on_delete=models.CASCADE)
    numero_de_referencia = models.IntegerField(unique=True)
    descripcion = models.TextField()
    class Meta: db_table = 'sistemas'
    def __str__(self): return f"{self.numero_de_referencia} - {self.descripcion}"

class Subsistema(models.Model):
    sistema = models.ForeignKey(Sistema, on_delete=models.CASCADE)
    numero_de_referencia = models.IntegerField(unique=True)
    descripcion = models.TextField()
    class Meta: db_table = 'subsistemas'
    def __str__(self): return f"{self.numero_de_referencia} - {self.descripcion}"

class Buque(models.Model):
    nombre = models.CharField(max_length=255)
    tipo = models.CharField(max_length=255)
    descripcion = models.TextField(blank=True, default='')
    autonomia_horas = models.IntegerField(null=True, blank=True)
    vida_diseno_anios = models.IntegerField(null=True, blank=True)
    horas_navegacion_anio = models.IntegerField(null=True, blank=True)
    imagen = models.CharField(max_length=255, null=True, blank=True)
    etapa = models.CharField(max_length=255, default='Activo')

    # 🔹 columnas que ya creaste por SQL:
    rondas_config = models.JSONField(default=dict, blank=True)   # db_column='rondas_config' si el nombre difiere
    documentos    = models.JSONField(default=list, blank=True)   # db_column='documentos'   si el nombre difiere

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

class Parametro(models.Model):
    nombre = models.CharField(max_length=255)
    unidad = models.CharField(max_length=100)
    valor_maximo = models.FloatField()
    valor_minimo = models.FloatField()
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta: db_table = 'parametros'
    def __str__(self): return self.nombre

class Equipo(models.Model):
    grupo = models.ForeignKey('Grupo', on_delete=models.CASCADE)
    subgrupo = models.ForeignKey('Subgrupo', on_delete=models.CASCADE)
    sistema = models.ForeignKey('Sistema', on_delete=models.CASCADE, null=True, blank=True)
    subsistema = models.ForeignKey('Subsistema', on_delete=models.CASCADE, null=True, blank=True)
    buque = models.ForeignKey('Buque', on_delete=models.CASCADE, null=True, blank=True)
    nombre_equipo = models.CharField(max_length=255)
    parametros = models.TextField(null=True, blank=True)
    imagen = models.CharField(max_length=255, null=True, blank=True)
    
    # 🔹 Nuevos campos SWBS
    descripcion = models.TextField(null=True, blank=True, default='')
    marca = models.CharField(max_length=255, null=True, blank=True)
    modelo = models.CharField(max_length=255, null=True, blank=True)
    serial = models.CharField(max_length=255, null=True, blank=True)
    codigo_cj = models.CharField(max_length=10, null=True, blank=True, help_text="Código CJ específico del equipo (ej: 23311, 23312)")
    numero_equipo_sap = models.CharField(max_length=100, null=True, blank=True, help_text="Número de equipo en sistema SAP")
    contador = models.IntegerField(null=True, blank=True, help_text="Contador del equipo")

    # 👇 Nuevo campo JSONB para documentación
    documentos = models.JSONField(default=list, blank=True)

    placas = models.JSONField(default=list, blank=True)

    parametros_imagenes = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True, editable=False)
    updated_at = models.DateTimeField(auto_now=True, editable=False)

    class Meta:
        db_table = 'equipos'
        indexes = [
            GinIndex(fields=['placas'], name='idx_equipos_placas_gin'),
            GinIndex(fields=['parametros_imagenes'], name='idx_equipos_paramimgs_gin'),
        ]

    def __str__(self):
        return self.nombre_equipo

class SubsistemaParametro(models.Model):
    subsistema = models.ForeignKey(Subsistema, on_delete=models.CASCADE)
    parametro  = models.ForeignKey(Parametro,  on_delete=models.CASCADE)
    class Meta:
        db_table = 'subsistema_parametros'
        unique_together = (('subsistema', 'parametro'),)

class EquipoParametro(models.Model):
    equipo    = models.ForeignKey(Equipo, on_delete=models.CASCADE)
    parametro = models.ForeignKey(Parametro, on_delete=models.CASCADE)
    config    = models.JSONField(default=dict, blank=True)
    class Meta:
        db_table = 'equipo_parametros'
        unique_together = (('equipo', 'parametro'),)

class Ronda(models.Model): 
    equipo = models.ForeignKey('Equipo', on_delete=models.CASCADE, related_name='rondas')
    buque  = models.ForeignKey('Buque', on_delete=models.SET_NULL, null=True, blank=True)
    tomado_en = models.DateTimeField(db_column='fecha')
    observaciones = models.TextField(blank=True, default='')
    tomado_por = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True, editable=False)
    class Meta:
        db_table = 'ronda'
        indexes = [models.Index(fields=['equipo', 'tomado_en'])]
        ordering = ['-tomado_en']
    def __str__(self):
        return f"Ronda eq={self.equipo_id} @ {self.tomado_en.isoformat()}"

class RondaLectura(models.Model):
    ronda = models.ForeignKey('Ronda', on_delete=models.CASCADE, related_name='lecturas')
    parametro = models.ForeignKey('Parametro', on_delete=models.PROTECT)
    valor = models.DecimalField(max_digits=12, decimal_places=4)
    unidad = models.CharField(max_length=100, blank=True, default='')
    valor_minimo = models.FloatField(null=True, blank=True)
    valor_maximo = models.FloatField(null=True, blank=True)
    class Meta:
        db_table = 'ronda_lecturas'
        unique_together = (('ronda', 'parametro'),)
        indexes = [models.Index(fields=['parametro'])]
    def __str__(self):
        return f"Lec ronda={self.ronda_id} param={self.parametro_id} val={self.valor}"
