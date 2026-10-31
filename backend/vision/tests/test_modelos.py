import os
import tempfile
from pathlib import Path
from unittest import mock

from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIClient

from vision import inference

URL_MODELOS = '/api/vision/modelos/'

CAMPOS = {
    'id', 'label', 'descripcion', 'arquitectura', 'version', 'produce_mascaras',
    'confianza_por_defecto', 'por_defecto', 'disponible',
}
IDS_CATALOGO = ['yolo-seg', 'yolo-tiled', 'maskrcnn', 'rtdetr']


class _PesosTemporales(SimpleTestCase):
    """Points the weights resolver at an empty temp dir (no real weights needed)."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.pesos = Path(self._tmp.name)
        # Also redirect the development fallback so the real repo cannot leak in.
        parches = [
            mock.patch.dict(os.environ, {'NAUTIC_WEIGHTS_DIR': str(self.pesos)}),
            mock.patch('core_engine.vision.weights.REPO_ROOT', self.pesos / 'sin-repo'),
        ]
        for parche in parches:
            parche.start()
            self.addCleanup(parche.stop)

    def _crear_pesos(self, *nombres):
        for nombre in nombres:
            (self.pesos / nombre).mkdir(exist_ok=True)


class DisponibilidadModeloTests(_PesosTemporales):
    def test_sin_pesos_no_esta_disponible(self):
        self.assertFalse(inference.modelo_disponible('yolo-seg'))
        self.assertEqual(
            inference.motivo_no_disponible('yolo-seg'),
            'Faltan los pesos del modelo en el servidor.',
        )

    def test_con_pesos_y_dependencias_esta_disponible(self):
        from core_engine.vision.adapters import yolo_seg

        self._crear_pesos(yolo_seg.WEIGHTS_NAME)

        with mock.patch('importlib.util.find_spec', return_value=object()):
            self.assertTrue(inference.modelo_disponible('yolo-seg'))
            self.assertIsNone(inference.motivo_no_disponible('yolo-seg'))

    def test_yolo_tiled_reutiliza_los_pesos_de_yolo_seg(self):
        from core_engine.vision.adapters import yolo_seg

        self._crear_pesos(yolo_seg.WEIGHTS_NAME)

        with mock.patch('importlib.util.find_spec', return_value=object()):
            self.assertTrue(inference.modelo_disponible('yolo-tiled'))
            self.assertFalse(inference.modelo_disponible('maskrcnn'))

    def test_dependencia_faltante_no_esta_disponible_aunque_haya_pesos(self):
        from core_engine.vision.adapters import rtdetr

        self._crear_pesos(rtdetr.WEIGHTS_NAME)
        instalados = {'torch'}

        def find_spec(nombre):
            return object() if nombre in instalados else None

        with mock.patch('importlib.util.find_spec', side_effect=find_spec):
            self.assertEqual(
                inference.motivo_no_disponible('rtdetr'),
                'Faltan dependencias del modelo en el servidor.',
            )

    def test_el_motivo_no_expone_rutas_del_servidor(self):
        motivo = inference.motivo_no_disponible('maskrcnn')

        self.assertNotIn(str(self.pesos), motivo)

    def test_modelo_fuera_del_mapa_de_requisitos_se_considera_disponible(self):
        self.assertIsNone(inference.motivo_no_disponible('modelo-futuro'))

    def test_comprobar_disponibilidad_no_importa_frameworks_pesados(self):
        with mock.patch('builtins.__import__', wraps=__import__) as importar:
            inference.modelo_disponible('rtdetr')

        importados = {c.args[0].split('.')[0] for c in importar.call_args_list}
        self.assertFalse(importados & {'torch', 'ultralytics', 'transformers'})


class ListarModelosTests(_PesosTemporales):
    def test_sigue_el_orden_y_los_campos_del_catalogo(self):
        modelos = inference.listar_modelos()

        self.assertEqual([m['id'] for m in modelos], IDS_CATALOGO)
        self.assertEqual(inference.ids_modelos(), IDS_CATALOGO)
        for m in modelos:
            self.assertEqual(set(m), CAMPOS)

    @override_settings(VISION_MODEL_ID='maskrcnn')
    def test_marca_como_por_defecto_el_de_la_configuracion(self):
        por_defecto = [m['id'] for m in inference.listar_modelos() if m['por_defecto']]

        self.assertEqual(por_defecto, ['maskrcnn'])
        self.assertEqual(inference.modelo_por_defecto(), 'maskrcnn')

    def test_confianza_y_mascaras_vienen_de_core_engine(self):
        por_id = {m['id']: m for m in inference.listar_modelos()}

        self.assertTrue(por_id['yolo-seg']['produce_mascaras'])
        self.assertFalse(por_id['rtdetr']['produce_mascaras'])
        self.assertEqual(por_id['yolo-seg']['confianza_por_defecto'], 0.15)
        self.assertEqual(por_id['maskrcnn']['confianza_por_defecto'], 0.5)


class ApiModelosTests(_PesosTemporales):
    def setUp(self):
        super().setUp()
        self.client = APIClient()

    def test_lista_los_cuatro_modelos_del_catalogo(self):
        res = self.client.get(URL_MODELOS)

        self.assertEqual(res.status_code, 200)
        modelos = res.json()['modelos']
        self.assertEqual([m['id'] for m in modelos], IDS_CATALOGO)
        for m in modelos:
            self.assertEqual(set(m), CAMPOS)

    @override_settings(VISION_MODEL_ID='yolo-seg')
    def test_solo_un_modelo_es_el_por_defecto(self):
        modelos = self.client.get(URL_MODELOS).json()['modelos']

        self.assertEqual([m['id'] for m in modelos if m['por_defecto']], ['yolo-seg'])

    def test_disponible_refleja_los_pesos_presentes(self):
        from core_engine.vision.adapters import maskrcnn

        self._crear_pesos(maskrcnn.WEIGHTS_NAME)

        with mock.patch('importlib.util.find_spec', return_value=object()):
            modelos = self.client.get(URL_MODELOS).json()['modelos']

        disponibles = {m['id']: m['disponible'] for m in modelos}
        self.assertEqual(
            disponibles,
            {'yolo-seg': False, 'yolo-tiled': False, 'maskrcnn': True, 'rtdetr': False},
        )

    def test_helpers_parcheados_se_reflejan_en_la_respuesta(self):
        with mock.patch('vision.views.listar_modelos', return_value=[{'id': 'x'}]):
            res = self.client.get(URL_MODELOS)

        self.assertEqual(res.json(), {'modelos': [{'id': 'x'}]})

    def test_solo_acepta_get(self):
        self.assertEqual(self.client.post(URL_MODELOS, {}, format='json').status_code, 405)
