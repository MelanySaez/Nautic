from unittest import mock

from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from vision.models import Buque
from vision.tests.utilidades import STORAGES_EN_MEMORIA, cliente_admin, png_bytes


def _url(buque_id):
    return f'/api/buques/{buque_id}/imagen/'


def _png(nombre='casco.png'):
    return SimpleUploadedFile(nombre, png_bytes(), content_type='image/png')


@override_settings(STORAGES=STORAGES_EN_MEMORIA)
class ImagenBuqueTests(TestCase):
    def setUp(self):
        self.client = cliente_admin()
        self.buque = Buque.objects.create(nombre='ARC Caribe', tipo='Fragata')

    def _subir(self, archivo, buque_id=None):
        return self.client.post(_url(buque_id or self.buque.id), {'imagen': archivo}, format='multipart')

    def test_sube_la_imagen_y_la_devuelve_como_url(self):
        res = self._subir(_png())

        self.assertEqual(res.status_code, 200, res.content)
        self.buque.refresh_from_db()
        self.assertTrue(self.buque.imagen.startswith('buques/imagenes/'))
        self.assertTrue(self.buque.imagen.endswith('.png'))
        self.assertTrue(default_storage.exists(self.buque.imagen))
        self.assertEqual(res.json()['imagen'], default_storage.url(self.buque.imagen))
        # The sheet and the list serve the same URL.
        self.assertEqual(self.client.get(f'/api/buques/{self.buque.id}/').json()['imagen'], res.json()['imagen'])
        self.assertEqual(self.client.get('/api/buques/').json()['resultados'][0]['imagen'], res.json()['imagen'])

    def test_reemplazar_borra_el_archivo_anterior(self):
        self._subir(_png())
        self.buque.refresh_from_db()
        anterior = self.buque.imagen

        res = self._subir(_png('otra.png'))

        self.assertEqual(res.status_code, 200)
        self.buque.refresh_from_db()
        self.assertNotEqual(self.buque.imagen, anterior)
        self.assertFalse(default_storage.exists(anterior))
        self.assertTrue(default_storage.exists(self.buque.imagen))

    def test_rechaza_un_archivo_que_no_es_imagen(self):
        falso = SimpleUploadedFile('falso.png', b'no soy una imagen', content_type='image/png')

        res = self._subir(falso)

        self.assertEqual(res.status_code, 400)
        self.assertIn('imagen', res.json()['campos'])
        self.buque.refresh_from_db()
        self.assertIsNone(self.buque.imagen)
        self.assertEqual(default_storage.listdir('')[1], [])

    def test_rechaza_una_extension_no_permitida(self):
        res = self._subir(SimpleUploadedFile('casco.gif', png_bytes(), content_type='image/gif'))

        self.assertEqual(res.status_code, 400)
        self.assertIn('imagen', res.json()['campos'])

    def test_rechaza_una_imagen_demasiado_grande(self):
        with mock.patch('vision.views_buques.TAMANO_MAXIMO_IMAGEN', 10):
            res = self._subir(_png())

        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()['campos']['imagen'], ['La imagen no puede superar 5 MB.'])
        self.buque.refresh_from_db()
        self.assertIsNone(self.buque.imagen)

    def test_falta_el_archivo(self):
        res = self.client.post(_url(self.buque.id), {}, format='multipart')

        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()['campos']['imagen'], ['Selecciona una imagen.'])

    def test_quitar_borra_la_imagen(self):
        self._subir(_png())
        self.buque.refresh_from_db()
        clave = self.buque.imagen

        res = self.client.delete(_url(self.buque.id))

        self.assertEqual(res.status_code, 200)
        self.assertIsNone(res.json()['imagen'])
        self.buque.refresh_from_db()
        self.assertIsNone(self.buque.imagen)
        self.assertFalse(default_storage.exists(clave))

    def test_quitar_sin_imagen_no_falla(self):
        res = self.client.delete(_url(self.buque.id))

        self.assertEqual(res.status_code, 200)
        self.assertIsNone(res.json()['imagen'])

    def test_buque_inexistente(self):
        self.assertEqual(self._subir(_png(), buque_id=999).status_code, 404)
        self.assertEqual(self.client.delete(_url(999)).status_code, 404)

    def test_requiere_sesion(self):
        res = APIClient().post(_url(self.buque.id), {'imagen': _png()}, format='multipart')

        self.assertEqual(res.status_code, 401)
        self.buque.refresh_from_db()
        self.assertIsNone(self.buque.imagen)


@override_settings(STORAGES=STORAGES_EN_MEMORIA)
class ImagenSoloLecturaTests(TestCase):
    """`imagen` is a storage key: the JSON endpoints must never let a client point it anywhere."""

    def setUp(self):
        self.client = cliente_admin()

    def test_crear_rechaza_imagen_en_json(self):
        res = self.client.post(
            '/api/buques/', {'nombre': 'A', 'tipo': 'Fragata', 'imagen': 'inspecciones/originales/x.jpg'}, format='json',
        )

        self.assertEqual(res.status_code, 400)
        self.assertIn('imagen', res.json()['campos'])
        self.assertEqual(Buque.objects.count(), 0)

    def test_editar_rechaza_imagen_en_json(self):
        buque = Buque.objects.create(nombre='A', tipo='Fragata')

        res = self.client.patch(f'/api/buques/{buque.id}/', {'imagen': 'inspecciones/originales/x.jpg'}, format='json')

        self.assertEqual(res.status_code, 400)
        self.assertIn('imagen', res.json()['campos'])
        buque.refresh_from_db()
        self.assertIsNone(buque.imagen)

    def test_un_texto_antiguo_no_se_sirve_como_url(self):
        buque = Buque.objects.create(nombre='Viejo', tipo='Fragata', imagen='caribe.png')

        self.assertIsNone(self.client.get(f'/api/buques/{buque.id}/').json()['imagen'])
        self.assertIsNone(self.client.get('/api/buques/').json()['resultados'][0]['imagen'])
