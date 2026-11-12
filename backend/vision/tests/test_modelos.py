import subprocess
import sys
from unittest import mock

from core_engine.vision import ModelAvailability
from django.conf import settings
from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIClient

from vision import inference

URL_MODELOS = '/api/vision/modelos/'

CAMPOS = {
    'id', 'label', 'descripcion', 'arquitectura', 'version', 'produce_mascaras',
    'confianza_por_defecto', 'por_defecto', 'disponible',
}
IDS_CATALOGO = ['yolo-seg', 'yolo-tiled', 'maskrcnn', 'rtdetr']


def _estado(model_id, missing_weights=(), missing_modules=(), install_hint=None):
    """Availability report as ``core_engine`` returns it."""
    return ModelAvailability(
        model_id=model_id,
        available=not missing_weights and not missing_modules,
        missing_weights=tuple(missing_weights),
        missing_modules=tuple(missing_modules),
        install_hint=install_hint,
    )


def _todos_disponibles():
    return [_estado(model_id) for model_id in IDS_CATALOGO]


def _parchear_disponibilidad(test, estados):
    """Patch ``model_availability`` / ``models_availability`` at the import site."""
    por_id = {e.model_id: e for e in estados}

    def por_modelo(model_id):
        if model_id not in por_id:
            raise ValueError(f'Unknown model: {model_id}')
        return por_id[model_id]

    parches = [
        mock.patch('vision.inference.model_availability', side_effect=por_modelo),
        mock.patch('vision.inference.models_availability', return_value=list(estados)),
    ]
    for parche in parches:
        parche.start()
        test.addCleanup(parche.stop)


class DisponibilidadModeloTests(SimpleTestCase):
    def test_disponible_cuando_core_engine_lo_reporta_disponible(self):
        _parchear_disponibilidad(self, [_estado('yolo-seg')])

        self.assertTrue(inference.modelo_disponible('yolo-seg'))
        self.assertIsNone(inference.motivo_no_disponible('yolo-seg'))

    def test_sin_pesos_el_motivo_nombra_los_pesos_faltantes(self):
        _parchear_disponibilidad(
            self, [_estado('maskrcnn', missing_weights=['maskrcnn-0.2.0.pt'])]
        )

        self.assertFalse(inference.modelo_disponible('maskrcnn'))
        self.assertEqual(
            inference.motivo_no_disponible('maskrcnn'),
            'Faltan los pesos del modelo en el servidor: maskrcnn-0.2.0.pt.',
        )

    def test_peso_de_directorio_se_reporta_como_directorio_barra_archivo(self):
        _parchear_disponibilidad(
            self, [_estado('rtdetr', missing_weights=['rtdetr-0.1.0/config.json'])]
        )

        self.assertIn('rtdetr-0.1.0/config.json', inference.motivo_no_disponible('rtdetr'))

    def test_sin_dependencias_el_motivo_nombra_modulos_e_instalacion(self):
        _parchear_disponibilidad(self, [_estado(
            'rtdetr', missing_modules=['torch', 'transformers'],
            install_hint="pip install 'nautic-core[rtdetr]'",
        )])

        self.assertEqual(
            inference.motivo_no_disponible('rtdetr'),
            'Faltan dependencias del modelo en el servidor: torch, transformers. '
            "Instalación: pip install 'nautic-core[rtdetr]'.",
        )

    def test_dependencias_sin_install_hint_omiten_la_instalacion(self):
        _parchear_disponibilidad(self, [_estado('rtdetr', missing_modules=['torch'])])

        self.assertEqual(
            inference.motivo_no_disponible('rtdetr'),
            'Faltan dependencias del modelo en el servidor: torch.',
        )

    def test_pesos_y_dependencias_faltantes_se_informan_juntos(self):
        _parchear_disponibilidad(self, [_estado(
            'maskrcnn', missing_weights=['maskrcnn-0.2.0.pt'],
            missing_modules=['torchvision'], install_hint='pip install nautic-core',
        )])

        motivo = inference.motivo_no_disponible('maskrcnn')

        self.assertIn('Faltan los pesos del modelo en el servidor: maskrcnn-0.2.0.pt.', motivo)
        self.assertIn('Faltan dependencias del modelo en el servidor: torchvision.', motivo)

    def test_el_motivo_no_expone_rutas_del_servidor(self):
        # core_engine reports names only; the message must never add a path.
        _parchear_disponibilidad(
            self, [_estado('maskrcnn', missing_weights=['maskrcnn-0.2.0.pt'])]
        )

        self.assertNotIn('/', inference.motivo_no_disponible('maskrcnn'))

    def test_modelo_fuera_del_catalogo_se_considera_disponible(self):
        # Same behaviour as before 3.1: unknown ids are validated by ids_modelos().
        _parchear_disponibilidad(self, _todos_disponibles())

        self.assertIsNone(inference.motivo_no_disponible('modelo-futuro'))
        self.assertTrue(inference.modelo_disponible('modelo-futuro'))

    def test_comprobar_disponibilidad_no_importa_frameworks_pesados(self):
        # Fresh interpreter: other tests may already have imported torch & co.
        codigo = (
            'import sys, django, os\n'
            'os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")\n'
            'django.setup()\n'
            'from vision import inference\n'
            'inference.listar_modelos(); inference.modelo_disponible("rtdetr")\n'
            'cargados = {"torch", "torchvision", "ultralytics", "transformers"} '
            '& set(sys.modules)\n'
            'print(sorted(cargados))\n'
        )
        res = subprocess.run(
            [sys.executable, '-c', codigo], capture_output=True, text=True, check=True,
            cwd=settings.BASE_DIR,  # so `config` and `vision` import from any runner cwd
        )

        self.assertEqual(res.stdout.strip().splitlines()[-1], '[]')


class ListarModelosTests(SimpleTestCase):
    def setUp(self):
        _parchear_disponibilidad(self, _todos_disponibles())

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

    def test_disponible_viene_de_models_availability(self):
        _parchear_disponibilidad(self, [
            _estado('yolo-seg'),
            _estado('yolo-tiled'),
            _estado('maskrcnn', missing_weights=['maskrcnn-0.2.0.pt']),
            _estado('rtdetr', missing_modules=['transformers']),
        ])

        disponibles = {m['id']: m['disponible'] for m in inference.listar_modelos()}

        self.assertEqual(
            disponibles,
            {'yolo-seg': True, 'yolo-tiled': True, 'maskrcnn': False, 'rtdetr': False},
        )

    def test_confianza_y_mascaras_vienen_de_core_engine(self):
        por_id = {m['id']: m for m in inference.listar_modelos()}

        self.assertTrue(por_id['yolo-seg']['produce_mascaras'])
        self.assertFalse(por_id['rtdetr']['produce_mascaras'])
        self.assertEqual(por_id['yolo-seg']['confianza_por_defecto'], 0.15)
        self.assertEqual(por_id['maskrcnn']['confianza_por_defecto'], 0.5)


class ApiModelosTests(SimpleTestCase):
    def setUp(self):
        _parchear_disponibilidad(self, _todos_disponibles())
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

    def test_disponible_refleja_la_disponibilidad_de_core_engine(self):
        _parchear_disponibilidad(self, [
            _estado('yolo-seg', missing_weights=['yolo-seg-0.1.0.pt']),
            _estado('yolo-tiled', missing_weights=['yolo-seg-0.1.0.pt']),
            _estado('maskrcnn'),
            _estado('rtdetr', missing_modules=['transformers']),
        ])

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
