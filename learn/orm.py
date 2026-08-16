from models import Libro, Editorial

# Obtener todos los libros
libros = Libro.objects.all()

# Obtener libro cuyo ID es 1
libro1 = Libro.objects.get(id=1)

# Obtener todos los libros que estén disponibles
libros_disponibles = Libro.objects.filter(disponible=True)

# Crear una nueva editorial llamada "Planeta"
editorial_planeta = Editorial.objects.create(nombre="Planeta")

# Acceder al nombre de la editorial de un libro
nombre_editorial = libro1.editorial.nombre