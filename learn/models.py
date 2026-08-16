from django.db import models

class Editorial(models.Model):
	nombre = models.CharField(max_length = 255)

class Libro(models.Model):
	titulo = models.CharField(max_length=255)
	autor = models.CharField(max_length=100)
	editorial = models.ForeignKey(Editorial, on_delete=models.CASCADE)
	paginas = models.IntegerField()
	disponible = models.BooleanField()
	descripcion = models.TextField(blank = True, null = True)
	anio_publicacion = models.IntegerField(default = 2000)
	
