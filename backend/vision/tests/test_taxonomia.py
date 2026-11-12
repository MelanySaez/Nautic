"""Class taxonomy from core_engine exposed on detections and as a catalog endpoint."""
from unittest import mock

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from vision.models import Buque, FotoInspeccion, InspeccionCasco, SeccionCasco
from vision.tasks import _notificar
from vision.tests.utilidades import STORAGES_EN_MEMORIA, crear_foto

DETECCIONES = [
    {'class_name': 'corrosion', 'count': 2, 'max_confidence': 0.9},
    {'class_name': 'ship_hull', 'count': 1, 'max_confidence': 0.8},
    {'class_name': 'clase_nueva', 'count': 1, 'max_confidence': 0.5},
]


@override_settings(STORAGES=STORAGES_EN_MEMORIA)
class DeteccionesConTaxonomiaTests(TestCase):
    def setUp(self):
        insp = InspeccionCasco.objects.create(
            buque=Buque.objects.create(nombre='ARC Caribe', tipo='Fragata')
        )
        seccion = SeccionCasco.objects.create(buque=insp.buque, codigo='FWD', nombre='Proa')
        self.foto = crear_foto(
            inspeccion=insp, seccion=seccion, imagen_original='inspecciones/originales/a.png',
            detecciones=DETECCIONES, estado=FotoInspeccion.Estado.COMPLETADA,
        )

    def _comprobar(self, detecciones):
        corrosion, casco, desconocida = detecciones
        self.assertEqual(corrosion, {
            'class_name': 'corrosion', 'count': 2, 'max_confidence': 0.9,
            'etiqueta': 'Corrosión', 'tipo': 'anomalia', 'severidad': 'critical',
        })
        self.assertEqual(
            (casco['etiqueta'], casco['tipo'], casco['severidad']),
            ('Casco del buque', 'componente', None),
        )
        self.assertEqual(
            (desconocida['etiqueta'], desconocida['tipo'], desconocida['severidad']),
            ('clase nueva', None, None),
        )

    def test_el_dict_de_la_foto_lleva_la_taxonomia_de_cada_deteccion(self):
        foto = APIClient().get(f'/api/vision/fotos/{self.foto.id}/').json()

        self._comprobar(foto['detecciones'])

    def test_el_evento_sse_lleva_la_taxonomia_de_cada_deteccion(self):
        with mock.patch('vision.tasks.publicar_evento') as publicar:
            _notificar(self.foto)

        self._comprobar(publicar.call_args.kwargs['data']['detecciones'])

    def test_una_foto_sin_analizar_sigue_en_none(self):
        self.foto.detecciones.all().delete()
        self.foto.estado = FotoInspeccion.Estado.PENDIENTE
        self.foto.save(update_fields=['estado'])

        foto = APIClient().get(f'/api/vision/fotos/{self.foto.id}/').json()

        self.assertIsNone(foto['detecciones'])


class TaxonomiaEndpointTests(TestCase):
    def test_lista_las_clases_de_la_libreria_con_version_y_color(self):
        respuesta = APIClient().get('/api/vision/taxonomia/')

        self.assertEqual(respuesta.status_code, 200)
        datos = respuesta.json()
        self.assertEqual(datos['version'], '1.0.0')
        self.assertEqual(len(datos['clases']), 10)
        self.assertEqual(datos['clases'][4], {
            'id': 4, 'nombre': 'corrosion', 'etiqueta': 'Corrosión',
            'tipo': 'anomalia', 'severidad': 'critical', 'color': '#f58230',
        })
        self.assertEqual(datos['clases'][9]['tipo'], 'componente')
        self.assertIsNone(datos['clases'][9]['severidad'])
