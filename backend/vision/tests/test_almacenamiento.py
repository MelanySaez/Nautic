import importlib
import logging
from unittest import mock

from django.apps import apps
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from vision import almacenamiento
from vision.models import Buque, FotoInspeccion, InspeccionCasco, SeccionCasco
from vision.tasks import procesar_foto
from vision.tests.utilidades import STORAGES_EN_MEMORIA, cliente_admin, png_bytes


def _fotos_url(inspeccion_id):
    return f'/api/vision/inspecciones/{inspeccion_id}/fotos/'


@override_settings(STORAGES=STORAGES_EN_MEMORIA)
class AlmacenamientoBase(TestCase):
    """Runs every test against an in-memory ``default_storage``."""

    def setUp(self):
        self.client = cliente_admin()
        self.insp = InspeccionCasco.objects.create(
            buque=Buque.objects.create(nombre='ARC Caribe', tipo='Fragata')
        )
        self.seccion = SeccionCasco.objects.create(
            buque=self.insp.buque, codigo='FWD-BTM', nombre='Fondo - Proa'
        )
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

    def test_rechaza_una_seccion_de_otro_buque(self):
        otra = SeccionCasco.objects.create(
            buque=Buque.objects.create(nombre='ARC Otro', tipo='Fragata'),
            codigo='FWD-BTM', nombre='Fondo - Proa',
        )
        archivo = SimpleUploadedFile('casco.png', png_bytes(), content_type='image/png')

        res = self.client.post(
            _fotos_url(self.insp.id),
            {'imagen': archivo, 'seccion_id': otra.id},
            format='multipart',
        )

        self.assertEqual(res.status_code, 400)
        self.assertIn('error', res.json())
        self.assertFalse(FotoInspeccion.objects.exists())

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


@override_settings(CACHES={
    'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'},
    'compartida': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'},
})
class UrlFirmadaTests(AlmacenamientoBase):
    """A signed URL is reused while it has at least half its lifetime left, so browsers can cache the photo."""

    def setUp(self):
        super().setUp()
        from django.core.cache import caches

        caches['compartida'].clear()
        self._parchear('vision.almacenamiento._cache_en_pausa_hasta', new=0.0)
        self.firmas = iter(range(1, 100))
        self.firmar = self._parchear_storage(
            'url', side_effect=lambda clave: f'https://bucket.example/{clave}?sig={next(self.firmas)}'
        )

    def _parchear_storage(self, atributo, **kwargs):
        patcher = mock.patch.object(default_storage.__class__, atributo, create=True, **kwargs)
        mocked = patcher.start()
        self.addCleanup(patcher.stop)
        return mocked

    def _como_s3(self, expiracion=900):
        self._parchear_storage('querystring_auth', new=True)
        self._parchear_storage('querystring_expire', new=expiracion)

    def test_s3_reutiliza_la_url_firmada_de_la_misma_clave(self):
        self._como_s3()

        primera = almacenamiento.url_archivo('inspecciones/a.jpg', mock.Mock())
        segunda = almacenamiento.url_archivo('inspecciones/a.jpg')

        self.assertEqual(primera, 'https://bucket.example/inspecciones/a.jpg?sig=1')
        self.assertEqual(segunda, primera)
        self.assertEqual(self.firmar.call_count, 1)

    def test_s3_claves_distintas_tienen_urls_distintas(self):
        self._como_s3()

        self.assertNotEqual(almacenamiento.url_archivo('a.jpg'), almacenamiento.url_archivo('b.jpg'))

    def test_s3_guarda_la_url_la_mitad_de_su_vigencia(self):
        self._como_s3(expiracion=600)
        with mock.patch('vision.almacenamiento.caches', {'compartida': mock.Mock()}) as caches:
            cache = caches['compartida']
            cache.get.return_value = None
            url = almacenamiento.url_archivo('a.jpg')

        self.assertEqual(cache.set.call_args.args[1:], (url, 300))

    def test_s3_sin_cache_disponible_firma_igual_y_la_pausa_sin_esperar_a_redis(self):
        self._como_s3()
        with mock.patch('vision.almacenamiento.caches', {'compartida': mock.Mock()}) as caches, \
                self.assertLogs('vision.almacenamiento', 'WARNING'):
            cache = caches['compartida']
            cache.get.side_effect = ConnectionError('redis caído')
            primera = almacenamiento.url_archivo('a.jpg')
            segunda = almacenamiento.url_archivo('b.jpg')

        self.assertEqual(primera, 'https://bucket.example/a.jpg?sig=1')
        self.assertEqual(segunda, 'https://bucket.example/b.jpg?sig=2')
        self.assertEqual(cache.get.call_count, 1)
        cache.set.assert_not_called()

    def test_s3_tras_la_pausa_vuelve_a_usar_la_cache(self):
        self._como_s3()
        with mock.patch('vision.almacenamiento.caches', {'compartida': mock.Mock()}) as caches, \
                mock.patch('vision.almacenamiento.time.monotonic', return_value=100.0) as reloj, \
                self.assertLogs('vision.almacenamiento', 'WARNING'):
            cache = caches['compartida']
            cache.get.side_effect = [ConnectionError('redis caído'), None]
            almacenamiento.url_archivo('a.jpg')
            reloj.return_value = 100.0 + almacenamiento.PAUSA_CACHE_SEGUNDOS + 1
            almacenamiento.url_archivo('a.jpg')

        self.assertEqual(cache.get.call_count, 2)
        cache.set.assert_called_once()

    def test_s3_si_falla_guardar_devuelve_la_firma_y_pausa_la_cache(self):
        self._como_s3()
        with mock.patch('vision.almacenamiento.caches', {'compartida': mock.Mock()}) as caches, \
                self.assertLogs('vision.almacenamiento', 'WARNING'):
            cache = caches['compartida']
            cache.get.return_value = None
            cache.set.side_effect = ConnectionError('redis caído')
            primera = almacenamiento.url_archivo('a.jpg')
            almacenamiento.url_archivo('b.jpg')

        self.assertEqual(primera, 'https://bucket.example/a.jpg?sig=1')
        self.assertEqual((cache.get.call_count, cache.set.call_count), (1, 1))

    def test_s3_cambiar_la_configuracion_de_firma_no_reutiliza_la_url(self):
        self._como_s3()
        nuevos = {
            'custom_domain': 'cdn.nuevo', 'region_name': 'eu-west-1', 'signature_version': 's3',
            'addressing_style': 'path', 'endpoint_url': 'https://otro.endpoint', 'location': 'prod',
            'access_key': 'AKIA-ROTADA', 'querystring_expire': 1800,
        }
        for atributo, valor in nuevos.items():
            with self.subTest(atributo=atributo):
                vieja = almacenamiento.url_archivo('a.jpg')
                # On the instance: the in-memory test storage sets its own ``location`` there.
                patcher = mock.patch.object(default_storage._wrapped, atributo, valor, create=True)
                patcher.start()
                self.addCleanup(patcher.stop)

                self.assertNotEqual(almacenamiento.url_archivo('a.jpg'), vieja)

    def test_s3_otro_bucket_no_reutiliza_la_url(self):
        self._como_s3()
        self._parchear_storage('bucket_name', new='fotos-viejo')
        vieja = almacenamiento.url_archivo('a.jpg')
        self._parchear_storage('bucket_name', new='fotos-nuevo')

        self.assertNotEqual(almacenamiento.url_archivo('a.jpg'), vieja)

    def test_storage_local_no_usa_la_cache(self):
        with mock.patch('vision.almacenamiento.caches', {'compartida': mock.Mock()}) as caches:
            cache = caches['compartida']
            almacenamiento.url_archivo('a.jpg')

        cache.get.assert_not_called()
        cache.set.assert_not_called()


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

        run.assert_called_once_with(png_bytes(), incluir_mascaras=True, model_id=settings.VISION_MODEL_ID)
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
        self.seccion = SeccionCasco.objects.create(buque=insp.buque, codigo='MID', nombre='Medio')
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
