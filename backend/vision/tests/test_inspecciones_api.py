import importlib
import io
import os
import shutil
import tempfile
from unittest import mock

from PIL import Image
from django.apps import apps
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from vision.models import (
    Buque,
    FotoInspeccion,
    InspeccionCasco,
    NivelSeveridad,
    SeccionCasco,
    recalcular_severidad_max,
    subir_severidad_max,
)
from vision.tasks import procesar_foto

URL_LISTA = '/api/vision/inspecciones/'


def _url_detalle(inspeccion_id):
    return f'/api/vision/inspecciones/{inspeccion_id}/'


def _crear_buque(nombre='ARC Caribe'):
    return Buque.objects.create(nombre=nombre, tipo='Fragata')


class NivelSeveridadTests(TestCase):
    def test_etiquetas_coinciden_con_texto_de_fotos(self):
        self.assertEqual(
            [n.label for n in NivelSeveridad],
            ['low', 'medium', 'high', 'critical'],
        )

    def test_texto_a_entero_y_vuelta(self):
        for texto, valor in [('low', 1), ('medium', 2), ('high', 3), ('critical', 4)]:
            self.assertEqual(NivelSeveridad.desde_texto(texto), valor)
            self.assertEqual(NivelSeveridad.a_texto(valor), texto)

    def test_valores_desconocidos_dan_none(self):
        self.assertIsNone(NivelSeveridad.desde_texto('extreme'))
        self.assertIsNone(NivelSeveridad.desde_texto(None))
        self.assertIsNone(NivelSeveridad.a_texto(None))
        self.assertIsNone(NivelSeveridad.a_texto(99))


class CrearInspeccionNombreTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.buque = _crear_buque()

    def _post(self, **extra):
        return self.client.post(
            URL_LISTA, {'buque_id': self.buque.id, **extra}, format='json',
        )

    def test_sin_nombre_genera_el_nombre_por_defecto(self):
        res = self._post()

        self.assertEqual(res.status_code, 201)
        body = res.json()
        self.assertEqual(body['nombre'], f"Inspección #{body['id']} — ARC Caribe")
        self.assertEqual(InspeccionCasco.objects.get(pk=body['id']).nombre, body['nombre'])
        self.assertIsNone(body['severidad_max'])

    def test_nombre_en_blanco_tambien_genera(self):
        body = self._post(nombre='   ').json()

        self.assertEqual(body['nombre'], f"Inspección #{body['id']} — ARC Caribe")

    def test_nombre_nulo_se_trata_como_ausente(self):
        body = self._post(nombre=None).json()

        self.assertEqual(body['nombre'], f"Inspección #{body['id']} — ARC Caribe")

    def test_nombre_personalizado_se_conserva_recortado(self):
        res = self._post(nombre='  Dique seco 2026  ')

        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()['nombre'], 'Dique seco 2026')

    def test_nombre_no_texto_es_400(self):
        res = self._post(nombre=123)

        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()['error'], 'Datos inválidos.')
        self.assertIn('nombre', res.json()['campos'])
        self.assertEqual(InspeccionCasco.objects.count(), 0)

    def test_nombre_demasiado_largo_es_400(self):
        res = self._post(nombre='x' * 256)

        self.assertEqual(res.status_code, 400)
        self.assertIn('nombre', res.json()['campos'])
        self.assertEqual(InspeccionCasco.objects.count(), 0)

    def test_nombre_de_255_caracteres_es_valido(self):
        res = self._post(nombre='x' * 255)

        self.assertEqual(res.status_code, 201)


class EditarInspeccionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.buque = _crear_buque()
        self.insp = InspeccionCasco.objects.create(
            buque=self.buque, nombre='Original', descripcion='desc',
        )

    def _patch(self, payload):
        return self.client.patch(_url_detalle(self.insp.id), payload, format='json')

    def test_renombra(self):
        res = self._patch({'nombre': '  Nuevo  '})

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['nombre'], 'Nuevo')
        self.insp.refresh_from_db()
        self.assertEqual(self.insp.nombre, 'Nuevo')

    def test_nombre_vacio_regenera_el_por_defecto(self):
        res = self._patch({'nombre': ''})

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['nombre'], f'Inspección #{self.insp.id} — ARC Caribe')

    def test_edita_descripcion_sin_tocar_nombre(self):
        res = self._patch({'descripcion': 'otra'})

        self.assertEqual(res.status_code, 200)
        self.insp.refresh_from_db()
        self.assertEqual(self.insp.descripcion, 'otra')
        self.assertEqual(self.insp.nombre, 'Original')

    def test_campo_desconocido_es_400(self):
        res = self._patch({'tomado_por': 'alguien', 'nombre': 'X'})

        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()['error'], 'Datos inválidos.')
        self.assertIn('tomado_por', res.json()['campos'])
        self.insp.refresh_from_db()
        self.assertEqual(self.insp.nombre, 'Original')

    def test_nombre_invalido_es_400(self):
        res = self._patch({'nombre': ['lista']})

        self.assertEqual(res.status_code, 400)
        self.assertIn('nombre', res.json()['campos'])

    def test_descripcion_no_texto_es_400(self):
        res = self._patch({'descripcion': 5})

        self.assertEqual(res.status_code, 400)
        self.assertIn('descripcion', res.json()['campos'])

    def test_inexistente_es_404(self):
        res = self.client.patch(_url_detalle(999999), {'nombre': 'X'}, format='json')

        self.assertEqual(res.status_code, 404)


class SeveridadMaxTests(TestCase):
    def setUp(self):
        self.buque = _crear_buque()
        self.insp = InspeccionCasco.objects.create(buque=self.buque)
        self.seccion = SeccionCasco.objects.create(codigo='FWD-BTM', nombre='Fondo - Proa')

    def _foto(self, severidad, estado=FotoInspeccion.Estado.COMPLETADA):
        return FotoInspeccion.objects.create(
            inspeccion=self.insp,
            seccion=self.seccion,
            imagen_original='media/x.jpg',
            severidad=severidad,
            estado=estado,
        )

    def _sev(self):
        return InspeccionCasco.objects.get(pk=self.insp.pk).severidad_max

    def test_sube_desde_null(self):
        self.assertTrue(subir_severidad_max(self.insp.id, NivelSeveridad.MEDIUM))
        self.assertEqual(self._sev(), 2)

    def test_nunca_baja(self):
        subir_severidad_max(self.insp.id, NivelSeveridad.HIGH)

        self.assertFalse(subir_severidad_max(self.insp.id, NivelSeveridad.LOW))
        self.assertFalse(subir_severidad_max(self.insp.id, NivelSeveridad.HIGH))
        self.assertEqual(self._sev(), 3)

    def test_nivel_none_no_hace_nada(self):
        self.assertFalse(subir_severidad_max(self.insp.id, None))
        self.assertIsNone(self._sev())

    def test_recalcular_toma_la_peor_foto_completada(self):
        self._foto('low')
        self._foto('high')
        self._foto('critical', estado=FotoInspeccion.Estado.ERROR)  # ignored
        self._foto(None)

        self.assertEqual(recalcular_severidad_max(self.insp.id), 3)
        self.assertEqual(self._sev(), 3)

    def test_recalcular_sin_fotos_deja_null(self):
        subir_severidad_max(self.insp.id, NivelSeveridad.HIGH)

        self.assertIsNone(recalcular_severidad_max(self.insp.id))
        self.assertIsNone(self._sev())

    def test_borrar_foto_recalcula_desde_las_restantes(self):
        peor = self._foto('critical')
        self._foto('medium')
        subir_severidad_max(self.insp.id, NivelSeveridad.CRITICAL)

        with mock.patch('vision.views.publicar_evento'):
            res = APIClient().delete(f'/api/vision/fotos/{peor.id}/')

        self.assertEqual(res.status_code, 204)
        self.assertEqual(self._sev(), 2)

    def test_borrar_la_ultima_foto_deja_null(self):
        unica = self._foto('high')
        subir_severidad_max(self.insp.id, NivelSeveridad.HIGH)

        with mock.patch('vision.views.publicar_evento'):
            APIClient().delete(f'/api/vision/fotos/{unica.id}/')

        self.assertIsNone(self._sev())

    def test_el_dict_expone_el_texto(self):
        subir_severidad_max(self.insp.id, NivelSeveridad.CRITICAL)

        body = APIClient().get(_url_detalle(self.insp.id)).json()

        self.assertEqual(body['severidad_max'], 'critical')
        self.assertIn('nombre', body)


class TareaActualizaSeveridadTests(TestCase):
    """procesar_foto raises severidad_max; inference and I/O side effects are stubbed."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        patcher = override_settings(BASE_DIR=self.tmp)
        patcher.enable()
        self.addCleanup(patcher.disable)
        for objetivo in ('vision.tasks.publicar_evento', 'vision.tasks.track_concurrent_end'):
            p = mock.patch(objetivo)
            p.start()
            self.addCleanup(p.stop)

        self.insp = InspeccionCasco.objects.create(buque=_crear_buque())
        self.seccion = SeccionCasco.objects.create(codigo='FWD-BTM', nombre='Fondo - Proa')

    def _foto_en_disco(self):
        buffer = io.BytesIO()
        Image.new('RGB', (4, 4)).save(buffer, format='PNG')
        ruta = 'originales/foto.png'
        os.makedirs(os.path.join(self.tmp, 'originales'), exist_ok=True)
        with open(os.path.join(self.tmp, ruta), 'wb') as fh:
            fh.write(buffer.getvalue())
        return FotoInspeccion.objects.create(
            inspeccion=self.insp, seccion=self.seccion, imagen_original=ruta,
        )

    def _procesar(self, foto, clases):
        detecciones = [{'class_name': c, 'confidence': 0.9} for c in clases]
        resultado = {'detections': detecciones, 'inference_time_ms': 1.0}
        with mock.patch('vision.tasks.run_inference', return_value=(b'jpg', resultado)):
            procesar_foto.apply(args=[foto.id]).get()

    def _sev(self):
        return InspeccionCasco.objects.get(pk=self.insp.pk).severidad_max

    def test_foto_procesada_sube_la_severidad_de_la_inspeccion(self):
        self._procesar(self._foto_en_disco(), ['marine_growth'])

        self.assertEqual(self._sev(), NivelSeveridad.MEDIUM)

    def test_una_foto_menos_grave_no_la_baja(self):
        self._procesar(self._foto_en_disco(), ['corrosion'])
        self._procesar(self._foto_en_disco(), ['paint_peel'])

        self.assertEqual(self._sev(), NivelSeveridad.CRITICAL)

    def test_foto_sin_detecciones_deja_null(self):
        self._procesar(self._foto_en_disco(), [])

        self.assertIsNone(self._sev())


class BackfillMigracionTests(TestCase):
    """The 0002 data migration fills name and severidad_max for pre-existing rows."""

    def test_rellena_nombre_y_severidad_solo_donde_hace_falta(self):
        migracion = importlib.import_module(
            'vision.migrations.0002_inspeccion_nombre_severidad'
        )
        buque = _crear_buque('ARC Gorgona')
        seccion = SeccionCasco.objects.create(codigo='MID-SS-P', nombre='Medio')
        vieja = InspeccionCasco.objects.create(buque=buque)
        con_nombre = InspeccionCasco.objects.create(buque=buque, nombre='Mío')
        vacia = InspeccionCasco.objects.create(buque=buque)
        for severidad, estado in [
            ('low', 'completada'), ('high', 'completada'), ('critical', 'error'),
        ]:
            FotoInspeccion.objects.create(
                inspeccion=vieja, seccion=seccion, imagen_original='media/x.jpg',
                severidad=severidad, estado=estado,
            )

        migracion.rellenar_nombre_y_severidad(apps, None)

        for insp in (vieja, con_nombre, vacia):
            insp.refresh_from_db()
        self.assertEqual(vieja.nombre, f'Inspección #{vieja.id} — ARC Gorgona')
        self.assertEqual(con_nombre.nombre, 'Mío')
        self.assertEqual(vieja.severidad_max, NivelSeveridad.HIGH)
        self.assertIsNone(vacia.severidad_max)
