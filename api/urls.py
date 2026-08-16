from django.urls import path
from . import views

urlpatterns = [
    # Páginas
    path('rondas/', views.rondas, name='rondas'),
    path('gestion-configuracion/', views.SWBS, name='swbs'),
    path('gestion_parametros/', views.gestion_parametros, name='gestion_parametros'),

    # API catálogos jerárquicos
    path('api/grupos/', views.api_grupos, name='api_grupos'),
    path('api/subgrupos/', views.api_subgrupos, name='api_subgrupos'),
    path('api/sistemas/', views.api_sistemas, name='api_sistemas'),
    path('api/sistema/<int:sistema_id>/', views.api_sistema_detail, name='api_sistema_detail'),
    path('api/subsistemas/', views.api_subsistemas, name='api_subsistemas'),
    path('api/subsistemas/auto-create/', views.api_subsistemas_auto_create, name='api_subsistemas_auto_create'),
    path('api/subsistema/<int:subsistema_id>/', views.api_subsistema_detail, name='api_subsistema_detail'),
    path('api/subsistemas/por-grupo/<int:grupo_id>/', views.api_subsistemas_por_grupo, name='api_subsistemas_por_grupo'),

    # API buques / equipos
    path('api/equipos/', views.api_equipos, name='api_equipos'),
    path('api/equipos-con-rondas/', views.api_equipos_con_rondas, name='api_equipos_con_rondas'),
    path('api/cj-sugerido/', views.api_cj_sugerido, name='api_cj_sugerido'),
    path('api/buques/', views.api_buques, name='api_buques'),
    path('api/buque/<int:buque_id>/', views.api_buque, name='api_buque'),
    path('api/buque/<int:buque_id>/nombre/', views.api_buque_nombre, name='api_buque_nombre'),
    path('api/equipos-por-buque/', views.api_equipos_por_buque, name='api_equipos_por_buque'),

    # Parámetros
    path("api/parametros/", views.obtener_parametros, name="obtener_parametros"),
    path("api/parametros/agregar/", views.agregar_parametro, name="agregar_parametro"),
    path("api/parametros/unidades/", views.obtener_unidades_parametros, name="obtener_unidades_parametros"),
    path("api/parametros/actualizar/<int:id>/", views.actualizar_parametro, name="actualizar_parametro"),
    path("api/parametros/eliminar/<int:id>/", views.eliminar_parametro, name="eliminar_parametro"),

    # Equipos
    path("equipo/", views.equipo_view, name="nuevo_equipo"),
    path("equipo/<int:equipo_id>/", views.equipo_view, name="editar_equipo"),

    # Relaciones parámetro ↔ subsistema
    path("api/subsistemas/<int:subsistema_id>/parametros/", views.subsistema_parametros, name="subsistema_parametros"),
    path("api/subsistemas/<int:subsistema_id>/parametros-detalle/", views.subsistema_parametros_detalle, name="subsistema_parametros_detalle"),
    path("api/subsistemas/<int:subsistema_id>/relacionar_parametros/", views.subsistema_relacionar_parametros, name="subsistema_relacionar_parametros"),
    path("api/parametros/<int:parametro_id>/relacionar_subsistemas/", views.parametro_relacionar_subsistemas, name="parametro_relacionar_subsistemas"),
    path("api/parametros/<int:parametro_id>/subsistemas/", views.parametro_subsistemas, name="parametro_subsistemas"),

    # Parámetros de equipo
    path('api/equipos/<int:equipo_id>/parametros-disponibles/', views.equipo_parametros_disponibles, name='equipo_parametros_disponibles'),
    path('api/equipos/<int:equipo_id>/parametros-seleccionados/', views.equipo_parametros_seleccionados, name='equipo_parametros_seleccionados'),
    path('api/equipos/<int:equipo_id>/parametros-detalle/', views.equipo_parametros_detalle, name='equipo_parametros_detalle'),
    path('api/equipos/parametros-detalle-batch/', views.equipos_parametros_detalle_batch, name='equipos_parametros_detalle_batch'),
    path('api/equipos/<int:equipo_id>/parametros/', views.equipo_fijar_parametros, name='equipo_fijar_parametros'),

    # Detalle/creación de equipo
    path('api/equipos/crear/', views.crear_equipo, name='crear_equipo'),
    path('api/equipos/<int:equipo_id>/', views.equipo_detail, name='equipo_detail'),
    path('api/equipos/<int:equipo_id>/imagen/', views.eliminar_imagen_equipo, name='eliminar_imagen_equipo'),
    path('api/equipos/<int:equipo_id>/documentos/', views.api_equipo_documentos, name='api_equipo_documentos'),

    # Ronda: resolver equipo por nombre o slug
    path('api/equipos/por-nombre/<str:nombre>/', views.api_equipo_por_nombre, name='api_equipo_por_nombre'),
    path('api/equipos/por-slug/<slug:slug>/', views.api_equipo_por_slug, name='api_equipo_por_slug'),
    path('api/rondas/', views.api_rondas, name='api_rondas'),
    path('api/rondas/<int:ronda_id>/', views.api_rondas_detail, name='api_rondas_detail'),
    path('api/rondas/estado/', views.api_rondas_estado, name='api_rondas_estado'),
    path('api/rondas/estado-multiple/', views.api_rondas_estado_multiple, name='api_rondas_estado_multiple'),
    path('api/rondas-equipos-parametros/', views.api_rondas_equipos_parametros, name='api_rondas_equipos_parametros'),
    path('api/lecturas/<int:equipo_id>/<int:parametro_id>/', views.api_lecturas_equipo_parametro, name='api_lecturas_equipo_parametro'),
    path('api/generate-test-data/', views.api_generate_test_data, name='api_generate_test_data'),
    path('api/generate-test-data-batch/', views.api_generate_test_data_batch, name='api_generate_test_data_batch'),
    path('api/generate-test-data-single/', views.api_generate_test_data_single, name='api_generate_test_data_single'),
    path('api/delete-test-data/', views.api_delete_test_data, name='api_delete_test_data'),
]
