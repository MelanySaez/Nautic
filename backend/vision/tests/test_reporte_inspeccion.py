"""PDF inspection report: the data it summarizes and the download endpoint."""
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from vision.models import Buque, FotoInspeccion, InspeccionCasco, NivelSeveridad, SeccionCasco
from vision.reporte import datos_reporte
from vision.tests.utilidades import STORAGES_EN_MEMORIA, png_bytes

COMPLETADA = FotoInspeccion.Estado.COMPLETADA


def _det(clase, total=1, confianza=0.8):
    return {'class_name': clase, 'count': total, 'max_confidence': confianza}


@override_settings(STORAGES=STORAGES_EN_MEMORIA)
class DatosReporteTests(TestCase):
    def setUp(self):
        self.buque = Buque.objects.create(
            nombre='ARC Caribe', tipo='Fragata', etapa='Activo', eslora_total_m=110.5,
        )
        self.proa = SeccionCasco.objects.create(buque=self.buque, codigo='PRW', nombre='Proa', orden=0)
        self.popa = SeccionCasco.objects.create(buque=self.buque, codigo='AFT', nombre='Popa', orden=1)
        self.quilla = SeccionCasco.objects.create(buque=self.buque, codigo='KEEL', nombre='Quilla', orden=2)
        self.insp = InspeccionCasco.objects.create(
            buque=self.buque, nombre='Dique 2026', tomado_por='J. Pérez',
            severidad_max=NivelSeveridad.CRITICAL,
        )

    def _foto(self, seccion, estado=COMPLETADA, detecciones=None, severidad=None, **extra):
        clave = default_storage.save('inspecciones/originales/x.png', ContentFile(png_bytes()))
        return FotoInspeccion.objects.create(
            inspeccion=self.insp, seccion=seccion, imagen_original=clave, estado=estado,
            detecciones=detecciones, severidad=severidad, **extra,
        )

    def test_resumen_cuenta_fotos_anomalias_y_cobertura(self):
        self._foto(self.proa, detecciones=[_det('corrosion', 2, 0.91), _det('anode')],
                   severidad='critical', modelo_id='yolo-seg', modelo_version='3.1', taxonomia_version='2')
        self._foto(self.proa, detecciones=[_det('paint_peel', 3, 0.6)], severidad='low',
                   modelo_id='yolo-seg', modelo_version='3.1', taxonomia_version='2')
        self._foto(self.popa, detecciones=[_det('anode')], modelo_id='rtdetr', modelo_version='1.0')
        self._foto(self.quilla, estado=FotoInspeccion.Estado.ERROR)
        self._foto(self.quilla, estado=FotoInspeccion.Estado.PENDIENTE)

        datos = datos_reporte(self.insp)

        self.assertEqual(datos['inspeccion']['codigo'], 'INS-%04d' % self.insp.id)
        self.assertEqual(datos['inspeccion']['tomado_por'], 'J. Pérez')
        resumen = datos['resumen']
        self.assertEqual(resumen['severidad_max'], 'critical')
        self.assertEqual(
            (resumen['fotos_total'], resumen['fotos_analizadas'], resumen['fotos_error'], resumen['fotos_pendientes']),
            (5, 3, 1, 1),
        )
        # Components (anode) are not anomalies; worst severity first.
        self.assertEqual(
            [(a['clase'], a['total'], a['severidad']) for a in resumen['anomalias']],
            [('corrosion', 2, 'critical'), ('paint_peel', 3, 'low')],
        )
        self.assertEqual(resumen['cobertura'], {'inspeccionadas': 2, 'total': 3})
        self.assertEqual([s['codigo'] for s in resumen['peores_secciones']], ['PRW'])
        self.assertEqual(
            datos['metodologia']['modelos'],
            [{'modelo': 'rtdetr', 'version': '1.0'}, {'modelo': 'yolo-seg', 'version': '3.1'}],
        )
        self.assertEqual(datos['metodologia']['taxonomias'], ['2'])

    def test_hallazgos_por_seccion_de_peor_a_mejor(self):
        self._foto(self.popa, detecciones=[_det('marine_growth', 1, 0.7)], severidad='medium')
        self._foto(self.proa, detecciones=[_det('defect', 1, 0.5)], severidad='high')
        self._foto(self.proa, detecciones=[_det('defect', 2, 0.9)], severidad='high')

        secciones = datos_reporte(self.insp)['secciones']

        self.assertEqual([s['codigo'] for s in secciones], ['PRW', 'AFT'])
        self.assertEqual(secciones[0]['fotos'], 2)
        self.assertEqual(secciones[0]['severidad'], 'high')
        self.assertEqual(
            secciones[0]['hallazgos'],
            [{'clase': 'defect', 'etiqueta': 'Defecto estructural', 'severidad': 'high', 'total': 3, 'confianza_max': 0.9}],
        )

    def test_evidencia_solo_fotos_analizadas_con_anomalias(self):
        con_anomalia = self._foto(self.proa, detecciones=[_det('corrosion')], severidad='critical',
                                  imagen_anotada='inspecciones/anotadas/1.jpg')
        self._foto(self.proa, detecciones=[_det('anode')])
        self._foto(self.popa, detecciones=[])

        evidencia = datos_reporte(self.insp)['evidencia']

        self.assertEqual([e['foto_id'] for e in evidencia], [con_anomalia.id])
        self.assertEqual(evidencia[0]['clave_imagen'], 'inspecciones/anotadas/1.jpg')

    def test_secciones_no_inspeccionadas(self):
        self._foto(self.proa, detecciones=[])
        self._foto(self.popa, estado=FotoInspeccion.Estado.ERROR)

        no_inspeccionadas = datos_reporte(self.insp)['no_inspeccionadas']

        self.assertEqual([s['codigo'] for s in no_inspeccionadas], ['AFT', 'KEEL'])


@override_settings(STORAGES=STORAGES_EN_MEMORIA)
class DescargarReporteTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        buque = Buque.objects.create(nombre='ARC Caribe', tipo='Fragata')
        self.seccion = SeccionCasco.objects.create(buque=buque, codigo='PRW', nombre='Proa')
        self.insp = InspeccionCasco.objects.create(buque=buque, nombre='Dique 2026')

    def _url(self, inspeccion_id):
        return f'/api/vision/inspecciones/{inspeccion_id}/reporte/'

    def test_descarga_un_pdf_adjunto(self):
        clave = default_storage.save('inspecciones/originales/a.png', ContentFile(png_bytes(64)))
        FotoInspeccion.objects.create(
            inspeccion=self.insp, seccion=self.seccion, imagen_original=clave,
            estado=COMPLETADA, detecciones=[_det('corrosion')], severidad='critical',
        )

        res = self.client.get(self._url(self.insp.id))

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'application/pdf')
        self.assertEqual(
            res['Content-Disposition'],
            f'attachment; filename="reporte-inspeccion-{self.insp.id}.pdf"',
        )
        self.assertTrue(res.content.startswith(b'%PDF'))

    def test_acepta_clientes_que_solo_piden_pdf(self):
        res = self.client.get(self._url(self.insp.id), HTTP_ACCEPT='application/pdf')

        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.content.startswith(b'%PDF'))

    def test_inspeccion_sin_fotos(self):
        res = self.client.get(self._url(self.insp.id))

        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.content.startswith(b'%PDF'))

    def test_imagen_ilegible_no_rompe_el_reporte(self):
        FotoInspeccion.objects.create(
            inspeccion=self.insp, seccion=self.seccion, imagen_original='inspecciones/originales/no-existe.png',
            estado=COMPLETADA, detecciones=[_det('corrosion')], severidad='critical',
        )

        with self.assertLogs('vision.reporte', level='WARNING'):
            res = self.client.get(self._url(self.insp.id))

        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.content.startswith(b'%PDF'))

    def test_inspeccion_inexistente(self):
        res = self.client.get(self._url(999999))

        self.assertEqual(res.status_code, 404)
