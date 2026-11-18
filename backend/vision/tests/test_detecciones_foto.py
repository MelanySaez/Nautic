"""Raw detections (boxes and masks) kept in photo storage and served per photo."""
import json
from unittest import mock

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import TestCase, override_settings

from vision.models import Buque, FotoInspeccion, InspeccionCasco, SeccionCasco, resumen_detecciones
from vision.tasks import procesar_foto
from vision.tests.utilidades import STORAGES_EN_MEMORIA, cliente_admin, png_bytes

MASCARA = {'size': [2, 2], 'counts': [0, 3, 1]}


def _resultado(*detecciones):
    return {
        'image_size': {'width': 640, 'height': 480},
        'inference_time_ms': 1.0,
        'detections': list(detecciones),
    }


def _deteccion(class_id, class_name, confidence, mask=None):
    det = {
        'class_id': class_id, 'class_name': class_name, 'confidence': confidence,
        'bbox': {'x1': 1.0, 'y1': 2.0, 'x2': 30.0, 'y2': 40.0, 'x_center': 15.5,
                 'y_center': 21.0, 'width': 29.0, 'height': 38.0},
    }
    if mask is not None:
        det['mask'] = mask
    return det


@override_settings(STORAGES=STORAGES_EN_MEMORIA)
class DeteccionesFotoTests(TestCase):
    def setUp(self):
        self.insp = InspeccionCasco.objects.create(
            buque=Buque.objects.create(nombre='ARC Caribe', tipo='Fragata')
        )
        seccion = SeccionCasco.objects.create(buque=self.insp.buque, codigo='FWD', nombre='Proa')
        clave = default_storage.save('inspecciones/originales/foto.png', ContentFile(png_bytes()))
        self.foto = FotoInspeccion.objects.create(
            inspeccion=self.insp, seccion=seccion, imagen_original=clave,
        )
        self.eventos = self._parchear('vision.tasks.publicar_evento')
        self._parchear('vision.tasks.track_concurrent_end')
        self._parchear('vision.views.publicar_evento')
        self.client = cliente_admin()

    def _parchear(self, objetivo):
        patcher = mock.patch(objetivo)
        mocked = patcher.start()
        self.addCleanup(patcher.stop)
        return mocked

    def _procesar(self, resultado):
        self.foto.estado = FotoInspeccion.Estado.PENDIENTE
        self.foto.save(update_fields=['estado'])
        with mock.patch('vision.tasks.run_inference', return_value=(b'anotada', resultado)) as run:
            procesar_foto.apply(args=[self.foto.id]).get()
        self.foto.refresh_from_db()
        return run

    def test_el_analisis_guarda_cajas_y_mascaras_en_el_storage_no_en_la_base(self):
        run = self._procesar(_resultado(
            _deteccion(4, 'corrosion', 0.91, MASCARA), _deteccion(9, 'ship_hull', 0.8),
        ))

        self.assertTrue(run.call_args.kwargs['incluir_mascaras'])
        self.assertEqual(resumen_detecciones(self.foto), [
            {'class_name': 'corrosion', 'count': 1, 'max_confidence': 0.91},
            {'class_name': 'ship_hull', 'count': 1, 'max_confidence': 0.8},
        ])
        with default_storage.open(self.foto.detecciones_archivo) as fh:
            guardado = json.load(fh)
        self.assertEqual((guardado['ancho'], guardado['alto']), (640, 480))
        self.assertEqual(guardado['detecciones'][0], {
            'class_id': 4, 'class_name': 'corrosion', 'confidence': 0.91,
            'bbox': {'x1': 1.0, 'y1': 2.0, 'x2': 30.0, 'y2': 40.0}, 'mask': MASCARA,
        })
        self.assertIsNone(guardado['detecciones'][1]['mask'])
        self.assertTrue(self.eventos.call_args.kwargs['data']['detalle_disponible'])

    def test_el_endpoint_devuelve_las_detecciones_con_la_taxonomia(self):
        self._procesar(_resultado(_deteccion(4, 'corrosion', 0.91, MASCARA), _deteccion(9, 'ship_hull', 0.8)))

        respuesta = self.client.get(f'/api/vision/fotos/{self.foto.id}/detecciones/')

        self.assertEqual(respuesta.status_code, 200)
        datos = respuesta.json()
        self.assertEqual((datos['ancho'], datos['alto']), (640, 480))
        self.assertEqual(datos['detecciones'][0], {
            'clase': 'corrosion', 'etiqueta': 'Corrosión', 'tipo': 'anomalia',
            'severidad': 'critical', 'color': '#f58230', 'confianza': 0.91,
            'bbox': {'x1': 1.0, 'y1': 2.0, 'x2': 30.0, 'y2': 40.0}, 'mascara': MASCARA,
        })
        self.assertEqual(datos['detecciones'][1]['tipo'], 'componente')
        self.assertIsNone(datos['detecciones'][1]['mascara'])
        self.assertTrue(self.client.get(f'/api/vision/fotos/{self.foto.id}/').json()['detalle_disponible'])

    def test_sin_detecciones_guardadas_el_endpoint_da_404(self):
        respuesta = self.client.get(f'/api/vision/fotos/{self.foto.id}/detecciones/')

        self.assertEqual(respuesta.status_code, 404)
        self.assertEqual(respuesta.json(), {'error': 'La foto no tiene detecciones guardadas.'})
        self.assertFalse(self.client.get(f'/api/vision/fotos/{self.foto.id}/').json()['detalle_disponible'])

    def _url(self):
        return f'/api/vision/fotos/{self.foto.id}/detecciones/'

    def test_el_endpoint_permite_revalidar_con_etag_en_cache_privada(self):
        self._procesar(_resultado(_deteccion(4, 'corrosion', 0.91, MASCARA)))

        respuesta = self.client.get(self._url())

        self.assertEqual(respuesta.status_code, 200)
        self.assertTrue(respuesta['ETag'].startswith('"'))
        self.assertEqual(respuesta['Cache-Control'], 'private, no-cache')

    def test_con_el_etag_vigente_responde_304_sin_leer_el_storage(self):
        self._procesar(_resultado(_deteccion(4, 'corrosion', 0.91, MASCARA)))
        etag = self.client.get(self._url())['ETag']

        with mock.patch('vision.views.leer_archivo') as leer:
            respuesta = self.client.get(self._url(), HTTP_IF_NONE_MATCH=etag)

        self.assertEqual(respuesta.status_code, 304)
        self.assertEqual(respuesta.content, b'')
        self.assertEqual(respuesta['ETag'], etag)
        self.assertEqual(respuesta['Cache-Control'], 'private, no-cache')
        leer.assert_not_called()

    def test_un_nuevo_analisis_cambia_el_etag_y_devuelve_las_detecciones_nuevas(self):
        self._procesar(_resultado(_deteccion(4, 'corrosion', 0.91, MASCARA)))
        etag = self.client.get(self._url())['ETag']
        self._procesar(_resultado(_deteccion(1, 'paint_peel', 0.7)))

        respuesta = self.client.get(self._url(), HTTP_IF_NONE_MATCH=etag)

        self.assertEqual(respuesta.status_code, 200)
        self.assertNotEqual(respuesta['ETag'], etag)
        self.assertEqual(respuesta.json()['detecciones'][0]['clase'], 'paint_peel')

    def test_el_etag_no_salta_el_permiso_de_una_inspeccion_privada(self):
        from django.contrib.auth import get_user_model
        from rest_framework.test import APIClient

        self._procesar(_resultado(_deteccion(4, 'corrosion', 0.91, MASCARA)))
        etag = self.client.get(self._url())['ETag']
        self.insp.privada = True
        self.insp.save(update_fields=['privada'])
        ajeno = APIClient()
        ajeno.force_authenticate(get_user_model().objects.create_user('ajeno@pruebas.local', None, nombre='Ajeno'))

        respuesta = ajeno.get(self._url(), HTTP_IF_NONE_MATCH=etag)

        self.assertEqual(respuesta.status_code, 404)
        self.assertNotIn('ETag', respuesta)

    def test_un_nuevo_analisis_reemplaza_el_archivo_y_borrar_la_foto_lo_elimina(self):
        self._procesar(_resultado(_deteccion(4, 'corrosion', 0.91, MASCARA)))
        anterior = self.foto.detecciones_archivo

        self._procesar(_resultado(_deteccion(1, 'paint_peel', 0.7)))

        self.assertNotEqual(self.foto.detecciones_archivo, anterior)
        self.assertFalse(default_storage.exists(anterior))
        actual = self.foto.detecciones_archivo
        self.assertEqual(self.client.delete(f'/api/vision/fotos/{self.foto.id}/').status_code, 204)
        self.assertFalse(default_storage.exists(actual))
