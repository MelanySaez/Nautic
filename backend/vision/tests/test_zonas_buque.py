"""`GET /api/buques/<id>/zonas/`: the latest readable inspection that photographed each hull section."""
from datetime import datetime

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from vision.models import Buque, FotoInspeccion, InspeccionCasco, InspeccionMiembro, SeccionCasco
from vision.tests.utilidades import STORAGES_EN_MEMORIA, crear_foto

Usuario = get_user_model()


def _url(buque_id):
    return f'/api/buques/{buque_id}/zonas/'


@override_settings(STORAGES=STORAGES_EN_MEMORIA)
class ZonasBuqueTests(TestCase):
    def setUp(self):
        self.lider = Usuario.objects.create_user('lider@x.com', None, nombre='Lía')
        self.miembro = Usuario.objects.create_user('miembro@x.com', None, nombre='Mia')
        self.extrano = Usuario.objects.create_user('otro@x.com', None, nombre='Ext')
        self.buque = Buque.objects.create(nombre='ARC Caribe', tipo='Fragata')
        self.proa = SeccionCasco.objects.create(buque=self.buque, codigo='FWD-BTM', nombre='Proa', orden=1)
        self.centro = SeccionCasco.objects.create(buque=self.buque, codigo='MID-BTM', nombre='Centro', orden=2)
        self.quilla = SeccionCasco.objects.create(buque=self.buque, codigo='KEEL', nombre='Quilla', orden=3)
        self.antigua = self._inspeccion('Control 2024', datetime(2024, 5, 1, 10))
        self.anterior = self._inspeccion('Control 2025', datetime(2025, 5, 1, 10))
        self.reciente = self._inspeccion('Control 2026', datetime(2026, 5, 1, 10))
        # Proa: photographed by all three; the newest wins.
        crear_foto(inspeccion=self.antigua, seccion=self.proa, imagen_original='a.png')
        crear_foto(inspeccion=self.anterior, seccion=self.proa, imagen_original='b.png')
        self.foto_proa = crear_foto(
            inspeccion=self.reciente, seccion=self.proa, imagen_original='c.png',
            estado=FotoInspeccion.Estado.COMPLETADA, severidad='critical',
            detecciones=[{'class_name': 'corrosion', 'count': 2, 'max_confidence': 0.9}],
        )
        # Centro: the newest did not photograph it, so the 2025 one colours it.
        self.foto_centro_1 = crear_foto(inspeccion=self.anterior, seccion=self.centro, imagen_original='d.png')
        self.foto_centro_2 = crear_foto(inspeccion=self.anterior, seccion=self.centro, imagen_original='e.png')
        crear_foto(inspeccion=self.antigua, seccion=self.centro, imagen_original='f.png')
        # Quilla: never photographed.

    def _inspeccion(self, nombre, fecha, **campos):
        insp = InspeccionCasco.objects.create(buque=self.buque, nombre=nombre, lider=self.lider, **campos)
        # auto_now_add ignores the value on create: set it afterwards.
        InspeccionCasco.objects.filter(pk=insp.pk).update(fecha_creacion=fecha)
        insp.refresh_from_db()
        return insp

    def _como(self, usuario):
        cliente = APIClient()
        if usuario is not None:
            cliente.force_authenticate(usuario)
        return cliente

    def _zonas(self, usuario=None, buque=None):
        res = self._como(usuario or self.extrano).get(_url((buque or self.buque).id))
        self.assertEqual(res.status_code, 200, res.content)
        return {z['seccion_id']: z for z in res.json()['zonas']}

    def test_cada_zona_toma_su_inspeccion_mas_reciente(self):
        zonas = self._zonas()

        self.assertEqual(set(zonas), {self.proa.id, self.centro.id})
        self.assertEqual(zonas[self.proa.id]['inspeccion'], {
            'id': self.reciente.id, 'nombre': 'Control 2026',
            'fecha_creacion': self.reciente.fecha_creacion.isoformat(),
        })
        self.assertEqual([f['id'] for f in zonas[self.proa.id]['fotos']], [self.foto_proa.id])
        self.assertEqual(zonas[self.centro.id]['inspeccion']['id'], self.anterior.id)
        self.assertEqual([f['id'] for f in zonas[self.centro.id]['fotos']],
                         [self.foto_centro_1.id, self.foto_centro_2.id])

    def test_empate_de_fecha_lo_desempata_el_id_mayor(self):
        empate = self._inspeccion('Empate', self.reciente.fecha_creacion)
        crear_foto(inspeccion=empate, seccion=self.proa, imagen_original='g.png')

        self.assertEqual(self._zonas()[self.proa.id]['inspeccion']['id'], max(empate.id, self.reciente.id))

    def test_las_zonas_se_ordenan_como_las_secciones(self):
        res = self._como(self.extrano).get(_url(self.buque.id))

        self.assertEqual([z['seccion_id'] for z in res.json()['zonas']], [self.proa.id, self.centro.id])

    def test_las_fotos_tienen_la_forma_del_detalle(self):
        foto = self._zonas()[self.proa.id]['fotos'][0]

        self.assertEqual(foto['seccion']['codigo'], 'FWD-BTM')
        self.assertEqual(foto['estado'], 'completada')
        self.assertEqual(foto['severidad'], 'critical')
        self.assertEqual(foto['detecciones'][0]['class_name'], 'corrosion')
        self.assertEqual(foto['detecciones'][0]['count'], 2)
        self.assertIn('etiqueta', foto['detecciones'][0])
        self.assertIn('detalle_disponible', foto)
        self.assertIn('subida_por', foto)

    def test_una_privada_ajena_no_colorea_para_quien_no_la_ve(self):
        privada = self._inspeccion('Secreta', datetime(2027, 1, 1), privada=True)
        crear_foto(inspeccion=privada, seccion=self.proa, imagen_original='h.png')
        crear_foto(inspeccion=privada, seccion=self.quilla, imagen_original='i.png')
        InspeccionMiembro.objects.create(inspeccion=privada, usuario=self.miembro, rol='observador')

        ajeno = self._zonas(self.extrano)
        self.assertEqual(ajeno[self.proa.id]['inspeccion']['id'], self.reciente.id)
        self.assertNotIn(self.quilla.id, ajeno)

        for usuario in (self.lider, self.miembro):
            propias = self._zonas(usuario)
            self.assertEqual(propias[self.proa.id]['inspeccion']['id'], privada.id)
            self.assertEqual(propias[self.quilla.id]['inspeccion']['id'], privada.id)

    def test_buque_sin_inspecciones_no_tiene_zonas(self):
        vacio = Buque.objects.create(nombre='Vacío', tipo='Lancha')
        SeccionCasco.objects.create(buque=vacio, codigo='KEEL', nombre='Quilla')

        self.assertEqual(self._zonas(buque=vacio), {})

    def test_otro_buque_no_mezcla_sus_fotos(self):
        otro = Buque.objects.create(nombre='Otro', tipo='Lancha')
        seccion = SeccionCasco.objects.create(buque=otro, codigo='KEEL', nombre='Quilla')
        insp = InspeccionCasco.objects.create(buque=otro, lider=self.lider)
        crear_foto(inspeccion=insp, seccion=seccion, imagen_original='j.png')

        self.assertNotIn(seccion.id, self._zonas())
        self.assertEqual(set(self._zonas(buque=otro)), {seccion.id})

    def test_consultas_acotadas_sin_importar_cuantas_fotos(self):
        for i in range(10):
            crear_foto(inspeccion=self.reciente, seccion=self.quilla, imagen_original=f'k{i}.png',
                       detecciones=[{'class_name': 'corrosion', 'count': 1, 'max_confidence': 0.5}])
        cliente = self._como(self.extrano)

        # Vessel lookup, photos (with section, uploader and inspection) and their detections.
        with self.assertNumQueries(3):
            res = cliente.get(_url(self.buque.id))
        self.assertEqual(len(res.json()['zonas']), 3)

    def test_requiere_sesion(self):
        self.assertEqual(self._como(None).get(_url(self.buque.id)).status_code, 401)

    def test_buque_inexistente(self):
        self.assertEqual(self._como(self.extrano).get(_url(999999)).status_code, 404)
