"""Model and taxonomy version recorded per photo (nautic_core 3.1 ``analyze()``)."""
from unittest import mock

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from vision.models import Buque, FotoInspeccion, InspeccionCasco, SeccionCasco
from vision.tasks import procesar_foto
from vision.tests.utilidades import STORAGES_EN_MEMORIA, png_bytes


@override_settings(STORAGES=STORAGES_EN_MEMORIA)
class VersionesPorFotoTests(TestCase):
    def setUp(self):
        self.insp = InspeccionCasco.objects.create(
            buque=Buque.objects.create(nombre='ARC Caribe', tipo='Fragata')
        )
        seccion = SeccionCasco.objects.create(codigo='FWD-BTM', nombre='Fondo - Proa')
        clave = default_storage.save('inspecciones/originales/foto.png', ContentFile(png_bytes()))
        self.foto = FotoInspeccion.objects.create(
            inspeccion=self.insp, seccion=seccion, imagen_original=clave,
        )
        self.eventos = self._parchear('vision.tasks.publicar_evento')
        self._parchear('vision.tasks.track_concurrent_end')

    def _parchear(self, objetivo):
        patcher = mock.patch(objetivo)
        mocked = patcher.start()
        self.addCleanup(patcher.stop)
        return mocked

    def _procesar(self, **resultado):
        resultado.setdefault('detections', [])
        resultado.setdefault('inference_time_ms', 1.0)
        with mock.patch('vision.tasks.run_inference', return_value=(b'anotada', resultado)):
            procesar_foto.apply(args=[self.foto.id]).get()
        self.foto.refresh_from_db()

    def _reintentar(self, **resultado):
        """Re-analysis as the retry endpoint does it: back to ``pendiente`` first."""
        self.foto.estado = FotoInspeccion.Estado.PENDIENTE
        self.foto.save(update_fields=['estado'])
        self._procesar(**resultado)

    def test_foto_nueva_no_tiene_versiones(self):
        self.assertIsNone(self.foto.modelo_version)
        self.assertIsNone(self.foto.taxonomia_version)

    def test_foto_completada_guarda_ambas_versiones(self):
        self._procesar(model_version='0.1.0', taxonomy_version='1.0.0')

        self.assertEqual(self.foto.estado, FotoInspeccion.Estado.COMPLETADA)
        self.assertEqual(self.foto.modelo_version, '0.1.0')
        self.assertEqual(self.foto.taxonomia_version, '1.0.0')

    def test_una_version_demasiado_larga_se_recorta_y_la_foto_se_completa(self):
        larga = '1.0.0+' + 'x' * 60
        self._procesar(model_version=larga, taxonomy_version=larga)

        self.assertEqual(self.foto.estado, FotoInspeccion.Estado.COMPLETADA)
        self.assertEqual(self.foto.modelo_version, larga[:32])
        self.assertEqual(self.foto.taxonomia_version, larga[:32])

    def test_claves_ausentes_o_vacias_quedan_en_none(self):
        self._procesar()
        self.assertIsNone(self.foto.modelo_version)
        self.assertIsNone(self.foto.taxonomia_version)

        self._reintentar(model_version='', taxonomy_version=None)
        self.assertEqual(self.foto.estado, FotoInspeccion.Estado.COMPLETADA)
        self.assertIsNone(self.foto.modelo_version)
        self.assertIsNone(self.foto.taxonomia_version)

    def test_un_nuevo_analisis_sobrescribe_las_versiones(self):
        self._procesar(model_version='0.1.0', taxonomy_version='1.0.0')

        self._reintentar(model_version='0.2.0', taxonomy_version='1.1.0')

        self.assertEqual(self.foto.modelo_version, '0.2.0')
        self.assertEqual(self.foto.taxonomia_version, '1.1.0')

    def test_un_nuevo_analisis_sin_versiones_no_deja_las_anteriores(self):
        self._procesar(model_version='0.1.0', taxonomy_version='1.0.0')

        self._reintentar()

        self.assertIsNone(self.foto.modelo_version)
        self.assertIsNone(self.foto.taxonomia_version)

    def test_el_evento_sse_final_lleva_las_versiones(self):
        self._procesar(model_version='0.1.0', taxonomy_version='1.0.0')

        final = self.eventos.call_args_list[-1].kwargs['data']
        self.assertEqual(final['estado'], FotoInspeccion.Estado.COMPLETADA)
        self.assertEqual(final['modelo_version'], '0.1.0')
        self.assertEqual(final['taxonomia_version'], '1.0.0')

    def test_todos_los_eventos_sse_incluyen_las_claves(self):
        self._procesar()

        cargas = [c.kwargs['data'] for c in self.eventos.call_args_list]
        self.assertTrue(cargas)
        for carga in cargas:
            self.assertIn('modelo_version', carga)
            self.assertIn('taxonomia_version', carga)

    def test_el_dict_de_la_foto_expone_las_versiones(self):
        self._procesar(model_version='0.1.0', taxonomy_version='1.0.0')
        client = APIClient()

        detalle = client.get(f'/api/vision/fotos/{self.foto.id}/').json()
        inspeccion = client.get(f'/api/vision/inspecciones/{self.insp.id}/').json()

        for foto in (detalle, inspeccion['fotos'][0]):
            self.assertEqual(foto['modelo_version'], '0.1.0')
            self.assertEqual(foto['taxonomia_version'], '1.0.0')

    def test_el_dict_expone_none_para_fotos_sin_versiones(self):
        foto = APIClient().get(f'/api/vision/fotos/{self.foto.id}/').json()

        self.assertIsNone(foto['modelo_version'])
        self.assertIsNone(foto['taxonomia_version'])


class RunInferenceConservaVersionesTests(TestCase):
    def test_run_inference_devuelve_las_versiones_de_analyze(self):
        from vision import inference

        resultado = {
            'detections': [], 'model_version': '0.1.0', 'taxonomy_version': '1.0.0',
        }
        with mock.patch('core_engine.vision.analyze', return_value=(b'jpg', resultado)):
            _, devuelto = inference.run_inference(b'img')

        self.assertEqual(devuelto['model_version'], '0.1.0')
        self.assertEqual(devuelto['taxonomy_version'], '1.0.0')
