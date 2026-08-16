from django.urls import path
from . import views

urlpatterns = [
	path('libros/', views.lista_libros, name='lista_libros'),
	path('editoriales/crear/', views.crear_editorial, name='crear_editorial')
]

