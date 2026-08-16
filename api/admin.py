from django.contrib import admin
from .models import Grupo, Subgrupo, Sistema, Subsistema, Buque, Equipo, Parametro

@admin.register(Grupo)
class GrupoAdmin(admin.ModelAdmin):
    list_display = ('id', 'numero_de_referencia', 'descripcion')
    search_fields = ('numero_de_referencia', 'descripcion')


@admin.register(Subgrupo)
class SubgrupoAdmin(admin.ModelAdmin):
    list_display = ('id', 'grupo', 'numero_de_referencia', 'descripcion')
    search_fields = ('numero_de_referencia', 'descripcion')
    list_filter = ('grupo',)


@admin.register(Sistema)
class SistemaAdmin(admin.ModelAdmin):
    list_display = ('id', 'subgrupo', 'numero_de_referencia', 'descripcion')
    search_fields = ('numero_de_referencia', 'descripcion')
    list_filter = ('subgrupo',)


@admin.register(Subsistema)
class SubsistemaAdmin(admin.ModelAdmin):
    list_display = ('id', 'sistema', 'numero_de_referencia', 'descripcion')
    search_fields = ('numero_de_referencia', 'descripcion')
    list_filter = ('sistema',)


@admin.register(Buque)
class BuqueAdmin(admin.ModelAdmin):
    list_display = ('id', 'nombre', 'tipo', 'etapa', 'autonomia_horas', 'vida_diseno_anios', 'horas_navegacion_anio')
    search_fields = ('nombre', 'tipo', 'descripcion')
    list_filter = ('etapa',)


@admin.register(Equipo)
class EquipoAdmin(admin.ModelAdmin):
    list_display = ('id', 'nombre_equipo', 'grupo', 'subgrupo', 'sistema', 'subsistema', 'buque')
    search_fields = ('nombre_equipo',)
    list_filter = ('grupo', 'subgrupo', 'sistema', 'subsistema', 'buque')


@admin.register(Parametro)
class ParametroAdmin(admin.ModelAdmin):
    list_display = ('id', 'nombre', 'unidad', 'valor_maximo', 'valor_minimo', 'created_at')
    search_fields = ('nombre', 'unidad')
