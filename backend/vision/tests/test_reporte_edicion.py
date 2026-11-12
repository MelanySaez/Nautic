"""Editable report draft: inspector texts and per-photo validation of findings."""
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from vision.models import (
    Buque, FotoInspeccion, InspeccionCasco, ReporteInspeccion, SeccionCasco, ValidacionFoto,
)
from vision.reporte import datos_reporte
from vision.tests.utilidades import STORAGES_EN_MEMORIA

COMPLETADA = FotoInspeccion.Estado.COMPLETADA


def _det(clase, total=1, confianza=0.8):
    return {'class_name': clase, 'count': total, 'max_confidence': confianza}


@override_settings(STORAGES=STORAGES_EN_MEMORIA)
class BaseReporte(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.buque = Buque.objects.create(nombre='ARC Caribe', tipo='Fragata')
        self.proa = SeccionCasco.objects.create(buque=self.buque, codigo='PRW', nombre='Proa', orden=0)
        self.popa = SeccionCasco.objects.create(buque=self.buque, codigo='AFT', nombre='Popa', orden=1)
        self.insp = InspeccionCasco.objects.create(buque=self.buque, nombre='Dique', tomado_por='J. Pérez')
        self.corroida = self._foto(self.proa, [_det('corrosion', 2, 0.9), _det('paint_peel'), _det('anode')], 'critical')
        self.incrustada = self._foto(self.popa, [_det('marine_growth', 1, 0.7)], 'medium')

    def _foto(self, seccion, detecciones, severidad, estado=COMPLETADA, inspeccion=None):
        return FotoInspeccion.objects.create(
            inspeccion=inspeccion or self.insp, seccion=seccion, imagen_original='inspecciones/originales/x.png',
            estado=estado, detecciones=detecciones, severidad=severidad,
        )

    def _url(self, inspeccion_id=None):
        return f'/api/vision/inspecciones/{inspeccion_id or self.insp.id}/reporte/'

    def _patch(self, payload, inspeccion_id=None):
        return self.client.patch(self._url(inspeccion_id), payload, format='json')


class ObtenerBorradorTests(BaseReporte):
    def test_borrador_vacio_con_las_fotos_revisables(self):
        self._foto(self.proa, [_det('anode')], None)  # components only: nothing to review
        self._foto(self.proa, [_det('corrosion')], None, estado=FotoInspeccion.Estado.PENDIENTE)

        res = self.client.get(self._url())

        self.assertEqual(res.status_code, 200)
        body = res.json()
        for campo in ('conclusion', 'observaciones', 'recomendaciones', 'inspector_cargo'):
            self.assertEqual(body[campo], '')
        # Known since the inspection was created: suggested, still editable.
        self.assertEqual(body['inspector_nombre'], 'J. Pérez')
        self.assertIsNone(body['actualizado'])
        self.assertEqual([f['foto_id'] for f in body['fotos']], [self.corroida.id, self.incrustada.id])
        primera = body['fotos'][0]
        self.assertEqual(primera['seccion']['codigo'], 'PRW')
        self.assertEqual(primera['nota'], '')
        self.assertIn('imagen', primera)
        self.assertEqual(
            [(h['clase'], h['etiqueta'], h['descartado']) for h in primera['hallazgos']],
            [('corrosion', 'Corrosión', False), ('paint_peel', 'Descascaramiento de pintura', False)],
        )

    def test_el_nombre_guardado_reemplaza_al_de_la_inspeccion(self):
        self._patch({'inspector_nombre': 'Ana Gómez'})
        self.assertEqual(self.client.get(self._url()).json()['inspector_nombre'], 'Ana Gómez')

        # Clearing it falls back to who took the inspection again.
        self._patch({'inspector_nombre': ''})
        self.assertEqual(self.client.get(self._url()).json()['inspector_nombre'], 'J. Pérez')

    def test_inspeccion_inexistente(self):
        self.assertEqual(self.client.get(self._url(999999)).status_code, 404)


class EditarBorradorTests(BaseReporte):
    def test_guarda_textos_y_validaciones(self):
        res = self._patch({
            'conclusion': '  Casco en estado regular. ',
            'inspector_nombre': 'Ana Gómez',
            'fotos': [{'foto_id': self.corroida.id, 'descartadas': ['paint_peel'], 'nota': 'Sombra, no pintura.'}],
        })

        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body['conclusion'], 'Casco en estado regular.')
        self.assertEqual(body['inspector_nombre'], 'Ana Gómez')
        self.assertEqual(body['observaciones'], '')
        self.assertIsNotNone(body['actualizado'])
        foto = body['fotos'][0]
        self.assertEqual(foto['nota'], 'Sombra, no pintura.')
        self.assertEqual({h['clase']: h['descartado'] for h in foto['hallazgos']},
                         {'corrosion': False, 'paint_peel': True})

        # A second PATCH changes only what it sends.
        self._patch({'observaciones': 'Revisar en seco.'})
        borrador = ReporteInspeccion.objects.get(inspeccion=self.insp)
        self.assertEqual(borrador.conclusion, 'Casco en estado regular.')
        self.assertEqual(borrador.observaciones, 'Revisar en seco.')
        self.assertEqual(ValidacionFoto.objects.get(foto=self.corroida).descartadas, ['paint_peel'])

    def test_volver_a_confirmar_un_hallazgo(self):
        self._patch({'fotos': [{'foto_id': self.corroida.id, 'descartadas': ['paint_peel']}]})

        self._patch({'fotos': [{'foto_id': self.corroida.id, 'descartadas': []}]})

        self.assertEqual(ValidacionFoto.objects.get(foto=self.corroida).descartadas, [])

    def test_datos_invalidos_no_guardan_nada(self):
        otra = InspeccionCasco.objects.create(buque=self.buque)
        ajena = self._foto(self.proa, [_det('corrosion')], 'critical', inspeccion=otra)
        pendiente = self._foto(self.proa, [_det('corrosion')], None, estado=FotoInspeccion.Estado.PENDIENTE)

        res = self._patch({
            'conclusion': 'ok',
            'observaciones': 5,
            'recomendaciones': 'x' * 5001,
            'campo_raro': 1,
            'fotos': [
                {'foto_id': self.corroida.id, 'descartadas': ['anode']},
                {'foto_id': ajena.id, 'descartadas': []},
                {'foto_id': pendiente.id, 'descartadas': []},
                {'foto_id': self.incrustada.id, 'descartadas': 'marine_growth'},
            ],
        })

        self.assertEqual(res.status_code, 400)
        campos = res.json()['campos']
        self.assertEqual(set(campos), {'observaciones', 'recomendaciones', 'campo_raro', 'fotos'})
        self.assertEqual(len(campos['fotos']), 4)
        self.assertFalse(ReporteInspeccion.objects.exists())
        self.assertFalse(ValidacionFoto.objects.exists())

    def test_foto_repetida(self):
        res = self._patch({'fotos': [
            {'foto_id': self.corroida.id, 'descartadas': ['paint_peel']},
            {'foto_id': self.corroida.id, 'descartadas': []},
        ]})

        self.assertEqual(res.status_code, 400)
        self.assertEqual(len(res.json()['campos']['fotos']), 1)
        self.assertFalse(ValidacionFoto.objects.exists())

    def test_foto_id_que_no_es_entero(self):
        res = self._patch({'fotos': [
            {'foto_id': [self.corroida.id], 'descartadas': []},
            {'foto_id': True, 'descartadas': []},
            {'foto_id': {'id': 1}},
        ]})

        self.assertEqual(res.status_code, 400)
        self.assertEqual(len(res.json()['campos']['fotos']), 3)

    def test_cuerpo_que_no_es_objeto(self):
        self.assertEqual(self._patch(['x']).status_code, 400)


class PdfConBorradorTests(BaseReporte):
    def test_hallazgos_descartados_no_cuentan(self):
        self._patch({
            'inspector_nombre': 'Ana Gómez',
            'conclusion': 'Regular.',
            'fotos': [
                {'foto_id': self.corroida.id, 'descartadas': ['corrosion'], 'nota': 'Era una sombra.'},
                {'foto_id': self.incrustada.id, 'descartadas': ['marine_growth']},
            ],
        })

        datos = datos_reporte(InspeccionCasco.objects.get(pk=self.insp.pk))

        resumen = datos['resumen']
        self.assertEqual([a['clase'] for a in resumen['anomalias']], ['paint_peel'])
        self.assertEqual(resumen['severidad_max'], 'low')
        self.assertEqual([(s['codigo'], s['severidad']) for s in datos['secciones']], [('PRW', 'low'), ('AFT', None)])
        self.assertEqual([e['foto_id'] for e in datos['evidencia']], [self.corroida.id])
        self.assertEqual(datos['evidencia'][0]['nota'], 'Era una sombra.')
        self.assertEqual(datos['inspeccion']['tomado_por'], 'Ana Gómez')
        self.assertEqual(datos['borrador']['conclusion'], 'Regular.')
        self.assertEqual(datos['metodologia']['revision'], {'revisado': True, 'descartados': 2})

    def test_sin_borrador_el_reporte_no_esta_revisado(self):
        datos = datos_reporte(self.insp)

        self.assertEqual(datos['inspeccion']['tomado_por'], 'J. Pérez')
        self.assertEqual(datos['metodologia']['revision'], {'revisado': False, 'descartados': 0})
        self.assertEqual(datos['borrador']['conclusion'], '')
        # The signature line also gets the inspection's inspector.
        self.assertEqual(datos['borrador']['inspector_nombre'], 'J. Pérez')

    def test_el_pdf_se_genera_con_el_borrador(self):
        self._patch({'conclusion': 'Regular <b>&</b>', 'fotos': [{'foto_id': self.corroida.id, 'descartadas': ['corrosion']}]})

        with self.assertLogs('vision.reporte', level='WARNING'):  # the test photo has no file
            res = self.client.get(f'{self._url()}pdf/')

        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.content.startswith(b'%PDF'))
