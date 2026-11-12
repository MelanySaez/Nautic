"""Grouped detections stored as rows (``DeteccionFoto``), one per class per photo."""
from unittest import mock

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import IntegrityError, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase, override_settings
from rest_framework.test import APIClient

from vision.models import Buque, DeteccionFoto, FotoInspeccion, InspeccionCasco, SeccionCasco
from vision.tasks import procesar_foto
from vision.tests.utilidades import STORAGES_EN_MEMORIA, png_bytes


def _det(class_id, class_name, confidence):
    return {'class_id': class_id, 'class_name': class_name, 'confidence': confidence,
            'bbox': {'x1': 1.0, 'y1': 2.0, 'x2': 3.0, 'y2': 4.0}}


@override_settings(STORAGES=STORAGES_EN_MEMORIA)
class DeteccionesPorFilaTests(TestCase):
    def setUp(self):
        self.insp = InspeccionCasco.objects.create(buque=Buque.objects.create(nombre='ARC Caribe', tipo='Fragata'))
        seccion = SeccionCasco.objects.create(buque=self.insp.buque, codigo='PRW', nombre='Proa')
        clave = default_storage.save('inspecciones/originales/foto.png', ContentFile(png_bytes()))
        self.foto = FotoInspeccion.objects.create(inspeccion=self.insp, seccion=seccion, imagen_original=clave)
        for objetivo in ('vision.tasks.publicar_evento', 'vision.tasks.track_concurrent_end'):
            patcher = mock.patch(objetivo)
            patcher.start()
            self.addCleanup(patcher.stop)

    def _procesar(self, *detecciones):
        resultado = {'detections': list(detecciones), 'inference_time_ms': 1.0}
        self.foto.estado = FotoInspeccion.Estado.PENDIENTE
        self.foto.save(update_fields=['estado'])
        with mock.patch('vision.tasks.run_inference', return_value=(b'anotada', resultado)):
            procesar_foto.apply(args=[self.foto.id]).get()
        self.foto.refresh_from_db()

    def _filas(self):
        return list(self.foto.detecciones.order_by('clase').values_list('clase', 'cantidad', 'confianza_max', 'descartada'))

    def test_el_analisis_guarda_una_fila_por_clase(self):
        self._procesar(_det(4, 'corrosion', 0.6), _det(4, 'corrosion', 0.9), _det(6, 'anode', 0.7))

        self.assertEqual(self._filas(), [('anode', 1, 0.7, False), ('corrosion', 2, 0.9, False)])

    def test_un_nuevo_analisis_reemplaza_las_filas_y_sus_descartes(self):
        self._procesar(_det(4, 'corrosion', 0.9), _det(1, 'paint_peel', 0.3))
        self.foto.detecciones.filter(clase='paint_peel').update(descartada=True)

        self._procesar(_det(1, 'paint_peel', 0.5))

        self.assertEqual(self._filas(), [('paint_peel', 1, 0.5, False)])

    def test_la_api_conserva_el_formato_de_detecciones(self):
        cliente = APIClient()
        url = f'/api/vision/fotos/{self.foto.id}/'
        self.assertIsNone(cliente.get(url).json()['detecciones'])  # never analyzed

        self._procesar()
        self.assertEqual(cliente.get(url).json()['detecciones'], [])  # analyzed, nothing found

        self._procesar(_det(4, 'corrosion', 0.9))
        self.assertEqual(cliente.get(url).json()['detecciones'], [{
            'class_name': 'corrosion', 'count': 1, 'max_confidence': 0.9,
            'etiqueta': 'Corrosión', 'tipo': 'anomalia', 'severidad': 'critical',
        }])

    def test_una_foto_ya_analizada_sin_hallazgos_sigue_en_lista_vacia_al_reencolarse(self):
        self._procesar()
        self.foto.estado = FotoInspeccion.Estado.PENDIENTE
        self.foto.save(update_fields=['estado'])

        self.assertEqual(APIClient().get(f'/api/vision/fotos/{self.foto.id}/').json()['detecciones'], [])

    def test_una_clase_por_foto(self):
        DeteccionFoto.objects.create(foto=self.foto, clase='corrosion', cantidad=1, confianza_max=0.5)

        with self.assertRaises(IntegrityError), transaction.atomic():
            DeteccionFoto.objects.create(foto=self.foto, clase='corrosion', cantidad=2, confianza_max=0.6)


ANTES = [('vision', '0010_reporte_editable')]
DESPUES = [('vision', '0012_quitar_json_detecciones')]


class MigracionDeteccionesTests(TransactionTestCase):
    def _migrar(self, destino):
        MigrationExecutor(connection).migrate(destino)
        return MigrationExecutor(connection).loader.project_state(destino).apps

    def tearDown(self):
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())

    def _datos_antiguos(self, apps):
        Buque, Seccion = apps.get_model('vision', 'Buque'), apps.get_model('vision', 'SeccionCasco')
        Inspeccion, Foto = apps.get_model('vision', 'InspeccionCasco'), apps.get_model('vision', 'FotoInspeccion')
        buque = Buque.objects.create(nombre='A', tipo='Fragata')
        foto = Foto.objects.create(
            inspeccion=Inspeccion.objects.create(buque=buque),
            seccion=Seccion.objects.create(buque=buque, codigo='PRW', nombre='Proa'),
            imagen_original='x.jpg', estado='completada', detecciones_archivo='d.json',
            detecciones=[
                {'class_name': 'corrosion', 'count': 2, 'max_confidence': 0.9},
                {'class_name': 'paint_peel', 'count': 1, 'max_confidence': 0.2},
            ],
        )
        apps.get_model('vision', 'ValidacionFoto').objects.create(
            foto=foto, descartadas=['paint_peel'], nota='Reflejo',
        )
        # Analyzed, nothing found: must stay `[]` both ways.
        self.vacia = Foto.objects.create(
            inspeccion=foto.inspeccion, seccion=foto.seccion, imagen_original='y.jpg',
            estado='completada', detecciones_archivo='e.json', detecciones=[],
        ).pk
        return foto.pk

    def test_copia_el_json_y_la_validacion_a_filas(self):
        foto_id = self._datos_antiguos(self._migrar(ANTES))

        apps = self._migrar(DESPUES)

        Foto, Deteccion = apps.get_model('vision', 'FotoInspeccion'), apps.get_model('vision', 'DeteccionFoto')
        self.assertEqual(Foto.objects.get(pk=foto_id).nota_inspector, 'Reflejo')
        self.assertEqual(
            list(Deteccion.objects.filter(foto_id=foto_id).order_by('clase')
                 .values_list('clase', 'cantidad', 'confianza_max', 'descartada')),
            [('corrosion', 2, 0.9, False), ('paint_peel', 1, 0.2, True)],
        )

    def test_es_reversible(self):
        foto_id = self._datos_antiguos(self._migrar(ANTES))
        self._migrar(DESPUES)

        apps = self._migrar(ANTES)

        foto = apps.get_model('vision', 'FotoInspeccion').objects.get(pk=foto_id)
        self.assertEqual(
            sorted(foto.detecciones, key=lambda d: d['class_name']),
            [{'class_name': 'corrosion', 'count': 2, 'max_confidence': 0.9},
             {'class_name': 'paint_peel', 'count': 1, 'max_confidence': 0.2}],
        )
        self.assertEqual(apps.get_model('vision', 'FotoInspeccion').objects.get(pk=self.vacia).detecciones, [])
        validacion = apps.get_model('vision', 'ValidacionFoto').objects.get(foto_id=foto_id)
        self.assertEqual((validacion.descartadas, validacion.nota), (['paint_peel'], 'Reflejo'))
