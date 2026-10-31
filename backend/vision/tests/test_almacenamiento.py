import importlib
import logging
from unittest import mock

from django.apps import apps
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from vision import almacenamiento
from vision.models import Buque, FotoInspeccion, InspeccionCasco, SeccionCasco
from vision.tasks import procesar_foto
from vision.tests.utilidades import STORAGES_EN_MEMORIA, png_bytes


def _fotos_url(inspeccion_id):
    return f'/api/vision/inspecciones/{inspeccion_id}/fotos/'


@override_settings(STORAGES=STORAGES_EN_MEMORIA)
class AlmacenamientoBase(TestCase):
    """Runs every test against an in-memory ``default_storage``."""

    def setUp(self):
        self.client = APIClient()
        self.insp = InspeccionCasco.objects.create(
            buque=Buque.objects.create(nombre='ARC Caribe', tipo='Fragata')
        )
        self.seccion = SeccionCasco.objects.create(codigo='FWD-BTM', nombre='Fondo - Proa')
        # Redis is not needed: SSE publishing is stubbed in the views and the task.
        self.eventos_tarea = self._parchear('vision.tasks.publicar_evento')
        self._parchear('vision.views.publicar_evento')
        self._parchear('vision.tasks.track_concurrent_end')
        self._parchear('vision.views.check_upload_rate', return_value=(True, None))

    def _parchear(self, objetivo, **kwargs):
        patcher = mock.patch(objetivo, **kwargs)
        mocked = patcher.start()
        self.addCleanup(patcher.stop)
        return mocked

    def _guardar(self, clave, contenido=b'x'):
        return default_storage.save(clave, ContentFile(contenido))

    def _foto(self, original='inspecciones/originales/a.png', anotada=None):
        return FotoInspeccion.objects.create(
            inspeccion=self.insp, seccion=self.seccion,
            imagen_original=original, imagen_anotada=anotada,
        )


class SubirFotoTests(AlmacenamientoBase):
    def _subir(self, nombre='casco.PNG'):
        archivo = SimpleUploadedFile(nombre, png_bytes(), content_type='image/png')
        return self.client.post(
            _fotos_url(self.insp.id),
            {'imagen': archivo, 'seccion_id': self.seccion.id},
            format='multipart',
        )

    def test_guarda_el_archivo_con_clave_sin_prefijo_media(self):
        res = self._subir()

        self.assertEqual(res.status_code, 202)
        foto = FotoInspeccion.objects.get()
        self.assertTrue(foto.imagen_original.startswith('inspecciones/originales/'))
        self.assertTrue(foto.imagen_original.endswith('.png'))
        self.assertNotIn('media/', foto.imagen_original)
        self.assertEqual(default_storage.open(foto.imagen_original).read(), png_bytes())

    def test_la_respuesta_trae_la_url_del_storage_en_absoluto(self):
        res = self._subir()

        foto = FotoInspeccion.objects.get()
        self.assertEqual(
            res.json()['imagen_original'],
            f'http://testserver/media/{foto.imagen_original}',
        )
        self.assertIsNone(res.json()['imagen_anotada'])

    def test_se_persiste_la_clave_devuelta_por_el_storage(self):
        # A backend may rename the file; the DB must hold the name it returned.
        with mock.patch(
            'vision.almacenamiento.default_storage.save', return_value='inspecciones/originales/renombrado.png'
        ):
            self._subir()

        self.assertEqual(
            FotoInspeccion.objects.get().imagen_original, 'inspecciones/originales/renombrado.png'
        )

    def test_el_listado_devuelve_la_url_de_la_foto(self):
        self._subir()

        res = self.client.get(f'/api/vision/inspecciones/{self.insp.id}/')

        foto = FotoInspeccion.objects.get()
        self.assertEqual(
            res.json()['fotos'][0]['imagen_original'],
            f'http://testserver/media/{foto.imagen_original}',
        )


class UrlArchivoTests(AlmacenamientoBase):
    def test_sin_clave_devuelve_none(self):
        self.assertIsNone(almacenamiento.url_archivo(None))
        self.assertIsNone(almacenamiento.url_archivo(''))

    def test_relativa_sin_request_queda_relativa(self):
        self.assertEqual(almacenamiento.url_archivo('inspecciones/a.jpg'), '/media/inspecciones/a.jpg')

    def test_url_absoluta_del_storage_no_se_toca(self):
        request = mock.Mock()
        with mock.patch.object(
            default_storage.__class__, 'url', return_value='https://bucket.example/a.jpg?sig=1'
        ):
            url = almacenamiento.url_archivo('a.jpg', request)

        self.assertEqual(url, 'https://bucket.example/a.jpg?sig=1')
        request.build_absolute_uri.assert_not_called()


class TareaStorageTests(AlmacenamientoBase):
    def _procesar(self, foto):
        resultado = {'detections': [{'class_name': 'corrosion', 'confidence': 0.9}], 'inference_time_ms': 1.0}
        with mock.patch('vision.tasks.run_inference', return_value=(b'anotada', resultado)) as run:
            procesar_foto.apply(args=[foto.id]).get()
        return run

    def test_lee_el_original_y_escribe_la_anotada_en_el_storage(self):
        clave = self._guardar('inspecciones/originales/foto.png', png_bytes())
        foto = self._foto(original=clave)

        run = self._procesar(foto)

        run.assert_called_once_with(png_bytes(), model_id=settings.VISION_MODEL_ID)
        foto.refresh_from_db()
        self.assertEqual(foto.estado, FotoInspeccion.Estado.COMPLETADA)
        self.assertRegex(foto.imagen_anotada, rf'^inspecciones/anotadas/{foto.id}_[0-9a-f]{{8}}\.jpg$')
        self.assertEqual(default_storage.open(foto.imagen_anotada).read(), b'anotada')

    def test_el_evento_sse_lleva_la_url_de_la_anotada(self):
        clave = self._guardar('inspecciones/originales/foto.png', png_bytes())
        foto = self._foto(original=clave)

        self._procesar(foto)

        foto.refresh_from_db()
        eventos = [c.kwargs['data'] for c in self.eventos_tarea.call_args_list]
        self.assertEqual(eventos[-1]['imagen_anotada'], f'/media/{foto.imagen_anotada}')

    def test_original_inexistente_marca_error(self):
        foto = self._foto(original='inspecciones/originales/no-existe.png')

        with mock.patch('vision.tasks.run_inference') as run, \
                mock.patch('vision.tasks.dead_letter'):
            # FileNotFoundError is an OSError: the task retries, then re-raises.
            with self.assertRaises(Exception):
                procesar_foto.apply(args=[foto.id], throw=True).get()

        run.assert_not_called()
        foto.refresh_from_db()
        self.assertEqual(foto.estado, FotoInspeccion.Estado.ERROR)


class BorrarTests(AlmacenamientoBase):
    def test_borrar_foto_elimina_original_y_anotada(self):
        original = self._guardar('inspecciones/originales/o.png')
        anotada = self._guardar('inspecciones/anotadas/a.jpg')
        foto = self._foto(original=original, anotada=anotada)

        res = self.client.delete(f'/api/vision/fotos/{foto.id}/')

        self.assertEqual(res.status_code, 204)
        self.assertFalse(default_storage.exists(original))
        self.assertFalse(default_storage.exists(anotada))
        self.assertFalse(FotoInspeccion.objects.filter(pk=foto.pk).exists())

    def test_borrar_inspeccion_elimina_los_archivos_de_todas_sus_fotos(self):
        claves = [self._guardar(f'inspecciones/originales/{i}.png') for i in range(2)]
        anotada = self._guardar('inspecciones/anotadas/1.jpg')
        self._foto(original=claves[0])
        self._foto(original=claves[1], anotada=anotada)

        res = self.client.delete(f'/api/vision/inspecciones/{self.insp.id}/')

        self.assertEqual(res.status_code, 204)
        for clave in [*claves, anotada]:
            self.assertFalse(default_storage.exists(clave))
        self.assertFalse(InspeccionCasco.objects.filter(pk=self.insp.pk).exists())

    def test_borrar_foto_sin_anotada_ni_archivo_no_falla(self):
        foto = self._foto(original='inspecciones/originales/ya-no-esta.png')

        res = self.client.delete(f'/api/vision/fotos/{foto.id}/')

        self.assertEqual(res.status_code, 204)

    def test_error_del_storage_se_registra_y_la_respuesta_sigue_siendo_exitosa(self):
        original = self._guardar('inspecciones/originales/o.png')
        foto = self._foto(original=original)

        with mock.patch(
            'vision.almacenamiento.default_storage.delete', side_effect=OSError('bucket caido')
        ), self.assertLogs('vision.almacenamiento', level=logging.ERROR) as logs:
            res = self.client.delete(f'/api/vision/fotos/{foto.id}/')

        self.assertEqual(res.status_code, 204)
        self.assertFalse(FotoInspeccion.objects.filter(pk=foto.pk).exists())
        self.assertIn(original, logs.output[0])

    def test_error_del_storage_al_borrar_inspeccion_no_impide_borrar_el_registro(self):
        self._foto(original=self._guardar('inspecciones/originales/o.png'))

        with mock.patch(
            'vision.almacenamiento.default_storage.delete', side_effect=OSError('bucket caido')
        ), self.assertLogs('vision.almacenamiento', level=logging.ERROR):
            res = self.client.delete(f'/api/vision/inspecciones/{self.insp.id}/')

        self.assertEqual(res.status_code, 204)
        self.assertFalse(InspeccionCasco.objects.filter(pk=self.insp.pk).exists())

    def test_borrar_archivo_devuelve_false_sin_clave_o_con_error(self):
        self.assertFalse(almacenamiento.borrar_archivo(None))
        self.assertFalse(almacenamiento.borrar_archivo(''))
        with mock.patch('vision.almacenamiento.default_storage.delete', side_effect=OSError), \
                self.assertLogs('vision.almacenamiento', level=logging.ERROR):
            self.assertFalse(almacenamiento.borrar_archivo('x'))


class MigracionPrefijoMediaTests(TestCase):
    """The 0003 data migration turns ``media/<key>`` paths into storage keys."""

    def setUp(self):
        self.migracion = importlib.import_module(
            'vision.migrations.0003_claves_de_almacenamiento'
        )
        insp = InspeccionCasco.objects.create(buque=Buque.objects.create(nombre='ARC', tipo='Fragata'))
        self.seccion = SeccionCasco.objects.create(codigo='MID', nombre='Medio')
        self.insp = insp

    def _foto(self, original, anotada=None):
        return FotoInspeccion.objects.create(
            inspeccion=self.insp, seccion=self.seccion,
            imagen_original=original, imagen_anotada=anotada,
        )

    def test_quita_el_prefijo_de_ambas_columnas(self):
        vieja = self._foto('media/inspecciones/originales/a.jpg', 'media/inspecciones/anotadas/1_ab.jpg')
        pendiente = self._foto('media/inspecciones/originales/b.jpg')

        self.migracion.quitar_prefijo_media(apps, None)

        vieja.refresh_from_db()
        pendiente.refresh_from_db()
        self.assertEqual(vieja.imagen_original, 'inspecciones/originales/a.jpg')
        self.assertEqual(vieja.imagen_anotada, 'inspecciones/anotadas/1_ab.jpg')
        self.assertEqual(pendiente.imagen_original, 'inspecciones/originales/b.jpg')
        self.assertIsNone(pendiente.imagen_anotada)

    def test_es_idempotente_y_respeta_claves_ya_migradas(self):
        nueva = self._foto('inspecciones/originales/c.jpg', 'inspecciones/anotadas/2_cd.jpg')
        # Only the leading prefix goes: a nested "media/" stays.
        anidada = self._foto('media/inspecciones/media/d.jpg')

        self.migracion.quitar_prefijo_media(apps, None)
        self.migracion.quitar_prefijo_media(apps, None)

        nueva.refresh_from_db()
        anidada.refresh_from_db()
        self.assertEqual(nueva.imagen_original, 'inspecciones/originales/c.jpg')
        self.assertEqual(nueva.imagen_anotada, 'inspecciones/anotadas/2_cd.jpg')
        self.assertEqual(anidada.imagen_original, 'inspecciones/media/d.jpg')

    def test_la_inversa_restituye_el_prefijo(self):
        foto = self._foto('inspecciones/originales/a.jpg', 'inspecciones/anotadas/1_ab.jpg')
        sin_anotada = self._foto('inspecciones/originales/b.jpg')

        self.migracion.restaurar_prefijo_media(apps, None)

        foto.refresh_from_db()
        sin_anotada.refresh_from_db()
        self.assertEqual(foto.imagen_original, 'media/inspecciones/originales/a.jpg')
        self.assertEqual(foto.imagen_anotada, 'media/inspecciones/anotadas/1_ab.jpg')
        self.assertEqual(sin_anotada.imagen_original, 'media/inspecciones/originales/b.jpg')
        self.assertIsNone(sin_anotada.imagen_anotada)
