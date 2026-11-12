"""Who did what: vessel creator, photo uploader, finding validator and report reviewer."""
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from vision.models import Buque, FotoInspeccion, ReporteInspeccion, SeccionCasco
from vision.tests.utilidades import STORAGES_EN_MEMORIA, crear_foto, png_bytes

Usuario = get_user_model()


@override_settings(STORAGES=STORAGES_EN_MEMORIA)
class TrazabilidadTests(TestCase):
    def setUp(self):
        self.ana = Usuario.objects.create_user('ana@x.com', None, nombre='Ana')
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.ana)
        for objetivo, extra in (('vision.views.publicar_evento', {}),
                                ('vision.views.check_upload_rate', {'return_value': (True, None)})):
            patcher = mock.patch(objetivo, **extra)
            patcher.start()
            self.addCleanup(patcher.stop)

    def _ref(self):
        return {'id': self.ana.id, 'nombre': 'Ana'}

    def _inspeccion(self):
        buque = Buque.objects.create(nombre='ARC Caribe', tipo='Fragata')
        seccion = SeccionCasco.objects.create(buque=buque, codigo='PRW', nombre='Proa')
        res = self.cliente.post('/api/vision/inspecciones/', {'buque_id': buque.id}, format='json')
        return res.json()['id'], seccion

    def test_quien_crea_el_buque(self):
        res = self.cliente.post('/api/buques/', {'nombre': 'ARC Pacífico', 'tipo': 'Fragata'}, format='json')

        self.assertEqual(res.status_code, 201)
        self.assertEqual(Buque.objects.get(pk=res.json()['id']).creado_por, self.ana)
        self.assertEqual(res.json()['creado_por'], self._ref())
        self.assertEqual(self.cliente.patch(f"/api/buques/{res.json()['id']}/", {'creado_por': 5},
                                            format='json').status_code, 400)

    def test_quien_sube_la_foto(self):
        inspeccion_id, seccion = self._inspeccion()

        res = self.cliente.post(f'/api/vision/inspecciones/{inspeccion_id}/fotos/', {
            'imagen': SimpleUploadedFile('casco.png', png_bytes(), content_type='image/png'),
            'seccion_id': seccion.id,
        }, format='multipart')

        self.assertEqual(res.status_code, 202, res.content)  # accepted: analysis comes later
        self.assertEqual(FotoInspeccion.objects.get(pk=res.json()['id']).subida_por, self.ana)
        self.assertEqual(res.json()['subida_por'], self._ref())

    def test_quien_valida_y_revisa_el_reporte(self):
        inspeccion_id, seccion = self._inspeccion()
        foto = crear_foto(inspeccion_id=inspeccion_id, seccion=seccion, imagen_original='o.png',
                          estado=FotoInspeccion.Estado.COMPLETADA, severidad='critical', detecciones=[
                              {'class_name': 'corrosion', 'count': 1, 'max_confidence': 0.9},
                              {'class_name': 'anode', 'count': 1, 'max_confidence': 0.8},
                          ])

        res = self.cliente.patch(f'/api/vision/inspecciones/{inspeccion_id}/reporte/', {
            'conclusion': 'Regular',
            'fotos': [{'foto_id': foto.id, 'descartadas': ['corrosion']}],
        }, format='json')

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['revisado_por'], self._ref())
        self.assertEqual(ReporteInspeccion.objects.get(inspeccion_id=inspeccion_id).revisado_por, self.ana)
        self.assertEqual(foto.detecciones.get(clase='corrosion').validado_por, self.ana)
        self.assertIsNone(foto.detecciones.get(clase='anode').validado_por)  # components are not reviewed

    def test_sin_nombre_se_muestra_un_alias_y_nunca_el_email(self):
        self.ana.nombre = ''
        self.ana.save(update_fields=['nombre'])

        res = self.cliente.post('/api/buques/', {'nombre': 'ARC Austral', 'tipo': 'Fragata'}, format='json')

        self.assertEqual(res.json()['creado_por'], {'id': self.ana.id, 'nombre': f'Usuario #{self.ana.id}'})

    def test_tomado_por_por_defecto_tampoco_usa_el_email(self):
        self.ana.nombre = ''
        self.ana.save(update_fields=['nombre'])
        buque = Buque.objects.create(nombre='ARC Austral', tipo='Fragata')

        res = self.cliente.post('/api/vision/inspecciones/', {'buque_id': buque.id}, format='json')

        self.assertEqual(res.json()['tomado_por'], f'Usuario #{self.ana.id}')

