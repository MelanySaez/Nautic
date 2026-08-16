from rest_framework.decorators import api_view
from rest_framework.response import Response
from models import Libro, Editorial

@api_view(['GET'])
def lista_libros(request):
	libros = Libro.objects.all().values("id", "titulo", "anio_publicacion")
	return Response(libros)

@api_view(['POST'])
def crear_editorial(request):
	nombre = request.data.get("nombre")
	new_editorial = Editorial.objects.create(nombre=nombre)
	return Response({"id": new_editorial.id, "nombre": new_editorial.nombre}, status=201)


