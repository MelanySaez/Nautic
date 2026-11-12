"""Inspection leaders, members with roles, private inspections and per-endpoint permissions."""
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from vision.models import Buque, FotoInspeccion, InspeccionCasco, InspeccionMiembro, SeccionCasco
from vision.tests.utilidades import STORAGES_EN_MEMORIA, crear_foto

Usuario = get_user_model()
TODOS = {'subir_fotos': True, 'analizar': True, 'editar_reporte': True, 'editar_inspeccion': True}
NINGUNO = {'subir_fotos': False, 'analizar': False, 'editar_reporte': False, 'editar_inspeccion': False}


@override_settings(STORAGES=STORAGES_EN_MEMORIA)
class BasePermisos(TestCase):
    def setUp(self):
        self.lider = Usuario.objects.create_user('lider@x.com', None, nombre='Lía Líder')
        self.colaborador = Usuario.objects.create_user('cola@x.com', None, nombre='Carlos')
        self.revisor = Usuario.objects.create_user('revi@x.com', None, nombre='Rita')
        self.observador = Usuario.objects.create_user('obse@x.com', None, nombre='Omar')
        self.extrano = Usuario.objects.create_user('otro@x.com', None, nombre='Ext')
        self.admin = Usuario.objects.create_superuser('admin@x.com', None)
        self.buque = Buque.objects.create(nombre='ARC Caribe', tipo='Fragata')
        self.seccion = SeccionCasco.objects.create(buque=self.buque, codigo='PRW', nombre='Proa')
        self.insp = self._crear_como(self.lider, nombre='Dique')
        for usuario, rol in ((self.colaborador, 'colaborador'), (self.revisor, 'revisor'),
                             (self.observador, 'observador')):
            res = self._como(self.lider).post(self._url('miembros/'), {'email': usuario.email, 'rol': rol},
                                              format='json')
            self.assertEqual(res.status_code, 201, res.content)
        self.foto = crear_foto(inspeccion=self.insp, seccion=self.seccion, imagen_original='o.png',
                               estado=FotoInspeccion.Estado.COMPLETADA, severidad='critical',
                               detecciones=[{'class_name': 'corrosion', 'count': 1, 'max_confidence': 0.9}])

    def _como(self, usuario):
        cliente = APIClient()
        if usuario is not None:
            cliente.force_authenticate(usuario)
        return cliente

    def _crear_como(self, usuario, **datos):
        res = self._como(usuario).post('/api/vision/inspecciones/', {'buque_id': self.buque.id, **datos},
                                       format='json')
        self.assertEqual(res.status_code, 201, res.content)
        return InspeccionCasco.objects.get(pk=res.json()['id'])

    def _url(self, sufijo='', inspeccion=None):
        return f'/api/vision/inspecciones/{(inspeccion or self.insp).id}/{sufijo}'

    def _privada(self):
        self.insp.privada = True
        self.insp.save(update_fields=['privada'])


class SesionObligatoriaTests(BasePermisos):
    def test_sin_sesion_toda_la_api_responde_401(self):
        anonimo = self._como(None)
        for url in ('/api/vision/inspecciones/', self._url(), '/api/buques/', '/api/vision/modelos/',
                    '/api/vision/taxonomia/', self._url('reporte/'), f'/api/vision/fotos/{self.foto.id}/'):
            self.assertEqual(anonimo.get(url).status_code, 401, url)

    def test_el_stream_tambien_exige_sesion(self):
        self.assertEqual(self.client.get(self._url('stream/')).status_code, 401)


class CrearInspeccionTests(BasePermisos):
    def test_quien_crea_es_el_lider_y_firma_por_defecto(self):
        res = self._como(self.extrano).post('/api/vision/inspecciones/', {'buque_id': self.buque.id}, format='json')

        body = res.json()
        # Other users' emails are never exposed: only id and name.
        self.assertEqual(body['lider'], {'id': self.extrano.id, 'nombre': 'Ext'})
        self.assertFalse(body['privada'])
        self.assertEqual(body['tomado_por'], 'Ext')
        self.assertEqual(body['mis_permisos'], {**TODOS, 'ver': True, 'es_lider': True})


class VisibilidadTests(BasePermisos):
    def _ids(self, usuario):
        return [i['id'] for i in self._como(usuario).get('/api/vision/inspecciones/').json()['resultados']]

    def test_publica_se_lee_por_todos_pero_sin_permisos(self):
        res = self._como(self.extrano).get(self._url())

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['mis_permisos'], {**NINGUNO, 'ver': True, 'es_lider': False})
        self.assertIn(self.insp.id, self._ids(self.extrano))
        self.assertEqual(self._como(self.extrano).get(self._url('reporte/')).status_code, 200)

    def test_privada_solo_la_ven_lider_miembros_y_admin(self):
        self._privada()

        for usuario in (self.lider, self.colaborador, self.observador, self.admin):
            self.assertEqual(self._como(usuario).get(self._url()).status_code, 200, usuario)
            self.assertIn(self.insp.id, self._ids(usuario))
        cliente = self._como(self.extrano)
        self.assertNotIn(self.insp.id, self._ids(self.extrano))
        for url in (self._url(), self._url('reporte/'), self._url('reporte/pdf/'), self._url('miembros/'),
                    f'/api/vision/fotos/{self.foto.id}/', f'/api/vision/fotos/{self.foto.id}/detecciones/'):
            self.assertEqual(cliente.get(url).status_code, 404, url)
        self.client.force_login(self.extrano)
        self.assertEqual(self.client.get(self._url('stream/')).status_code, 404)

    def test_permisos_de_cada_rol(self):
        esperados = {
            self.lider: {**TODOS, 'es_lider': True},
            self.colaborador: {**TODOS, 'es_lider': False},
            self.revisor: {**NINGUNO, 'editar_reporte': True, 'es_lider': False},
            self.observador: {**NINGUNO, 'es_lider': False},
            self.admin: {**TODOS, 'es_lider': True},
        }
        for usuario, permisos in esperados.items():
            self.assertEqual(self._como(usuario).get(self._url()).json()['mis_permisos'],
                             {**permisos, 'ver': True}, usuario.email)


class AccionesTests(BasePermisos):
    def _codigos(self, usuario):
        c = self._como(usuario)
        with mock.patch('vision.views.procesar_foto'):
            return {
                'renombrar': c.patch(self._url(), {'nombre': 'Nuevo'}, format='json').status_code,
                'reporte': c.patch(self._url('reporte/'), {'conclusion': 'ok'}, format='json').status_code,
                'analizar': c.post(self._url('analizar/'), {}, format='json').status_code,
                'reintentar': c.post(f'/api/vision/fotos/{self.foto.id}/', {}, format='json').status_code,
                'subir': c.post(self._url('fotos/'), {}, format='multipart').status_code,
            }

    def test_matriz_de_roles(self):
        self.assertEqual(self._codigos(self.extrano),
                         {'renombrar': 403, 'reporte': 403, 'analizar': 403, 'reintentar': 403, 'subir': 403})
        self.assertEqual(self._codigos(self.observador),
                         {'renombrar': 403, 'reporte': 403, 'analizar': 403, 'reintentar': 403, 'subir': 403})
        revisor = self._codigos(self.revisor)
        self.assertEqual(revisor['reporte'], 200)
        self.assertEqual({k: v for k, v in revisor.items() if k != 'reporte'},
                         {'renombrar': 403, 'analizar': 403, 'reintentar': 403, 'subir': 403})
        colaborador = self._codigos(self.colaborador)
        self.assertEqual((colaborador['renombrar'], colaborador['reporte']), (200, 200))
        self.assertNotIn(403, colaborador.values())

    def test_borrar_foto_exige_subir_fotos(self):
        url = f'/api/vision/fotos/{self.foto.id}/'
        self.assertEqual(self._como(self.revisor).delete(url).status_code, 403)
        self.assertEqual(self._como(self.colaborador).delete(url).status_code, 204)

    def test_solo_el_lider_borra_o_vuelve_privada(self):
        for usuario in (self.colaborador, self.extrano):
            self.assertEqual(self._como(usuario).patch(self._url(), {'privada': True}, format='json').status_code, 403)
            self.assertEqual(self._como(usuario).delete(self._url()).status_code, 403)

        res = self._como(self.lider).patch(self._url(), {'privada': True}, format='json')
        self.assertEqual((res.status_code, res.json()['privada']), (200, True))
        self.assertEqual(self._como(self.lider).delete(self._url()).status_code, 204)

    def test_traspasar_el_liderazgo(self):
        res = self._como(self.lider).patch(self._url(), {'lider_id': self.revisor.id}, format='json')

        self.assertEqual(res.status_code, 200)
        self.insp.refresh_from_db()
        self.assertEqual(self.insp.lider, self.revisor)
        # The new leader stops being a member; the previous one stays as Colaborador.
        self.assertFalse(InspeccionMiembro.objects.filter(inspeccion=self.insp, usuario=self.revisor).exists())
        anterior = InspeccionMiembro.objects.get(inspeccion=self.insp, usuario=self.lider)
        self.assertEqual(anterior.rol, 'colaborador')
        self.assertEqual(self._como(self.colaborador).patch(
            self._url(), {'lider_id': self.colaborador.id}, format='json').status_code, 403)


class MiembrosTests(BasePermisos):
    def test_lista_de_miembros(self):
        res = self._como(self.extrano).get(self._url('miembros/'))

        self.assertEqual(res.status_code, 200)
        self.assertTrue(all('email' not in m['usuario'] for m in res.json()))
        filas = {m['usuario']['nombre']: (m['rol'], m['permisos']) for m in res.json()}
        self.assertEqual(filas, {
            'Carlos': ('colaborador', TODOS),
            'Rita': ('revisor', {**NINGUNO, 'editar_reporte': True}),
            'Omar': ('observador', NINGUNO),
        })

    def test_permisos_ajustados_quedan_como_personalizado(self):
        otra = self._crear_como(self.lider)
        res = self._como(self.lider).post(self._url('miembros/', otra), {
            'email': 'OTRO@x.com', 'rol': 'revisor', 'permisos': {'analizar': True},
        }, format='json')

        self.assertEqual(res.status_code, 201)
        self.assertEqual((res.json()['rol'], res.json()['permisos']),
                         ('personalizado', {**NINGUNO, 'editar_reporte': True, 'analizar': True}))

    def test_cambiar_y_quitar_un_miembro(self):
        miembro = InspeccionMiembro.objects.get(inspeccion=self.insp, usuario=self.observador)
        url = self._url(f'miembros/{miembro.id}/')

        res = self._como(self.lider).patch(url, {'rol': 'colaborador'}, format='json')
        self.assertEqual((res.status_code, res.json()['permisos']), (200, TODOS))
        self.assertEqual(self._como(self.observador).patch(self._url(), {'nombre': 'X'}, format='json').status_code, 200)

        self.assertEqual(self._como(self.lider).delete(url).status_code, 204)
        self.assertEqual(self._como(self.observador).patch(self._url(), {'nombre': 'Y'}, format='json').status_code, 403)

    def test_errores_al_invitar(self):
        lider = self._como(self.lider)
        casos = [
            ({'email': 'nadie@x.com', 'rol': 'revisor'}, 'email'),
            ({'email': 'cola@x.com', 'rol': 'revisor'}, 'email'),      # already a member
            ({'email': 'lider@x.com', 'rol': 'revisor'}, 'email'),     # the leader
            ({'email': 'otro@x.com', 'rol': 'jefe'}, 'rol'),
            ({'email': 'otro@x.com', 'rol': 'revisor', 'permisos': {'borrar': True}}, 'permisos'),
        ]
        for datos, campo in casos:
            res = lider.post(self._url('miembros/'), datos, format='json')
            self.assertEqual(res.status_code, 400, datos)
            self.assertIn(campo, res.json()['campos'], datos)

    def test_solo_el_lider_gestiona_miembros(self):
        miembro = InspeccionMiembro.objects.get(inspeccion=self.insp, usuario=self.observador)
        for usuario in (self.colaborador, self.extrano):
            c = self._como(usuario)
            self.assertEqual(c.post(self._url('miembros/'), {'email': 'otro@x.com', 'rol': 'revisor'},
                                    format='json').status_code, 403)
            self.assertEqual(c.patch(self._url(f'miembros/{miembro.id}/'), {'rol': 'revisor'},
                                     format='json').status_code, 403)
            self.assertEqual(c.delete(self._url(f'miembros/{miembro.id}/')).status_code, 403)


class BuquesConInspeccionesTests(BasePermisos):
    def _totales(self, usuario):
        res = self._como(usuario).get('/api/buques/?con_inspecciones=1')
        return {b['nombre']: b['total_inspecciones'] for b in res.json()['resultados']}

    def test_las_inspecciones_privadas_no_se_cuentan_para_quien_no_las_ve(self):
        self._crear_como(self.lider)                      # ARC Caribe: Dique (public) + a second public one
        self._privada()                                   # Dique becomes private
        solo_privada = Buque.objects.create(nombre='ARC Secreto', tipo='Fragata')
        oculta = InspeccionCasco.objects.create(buque=solo_privada, lider=self.lider, privada=True)

        self.assertEqual(self._totales(self.extrano), {'ARC Caribe': 1})
        self.assertEqual(self._totales(self.observador), {'ARC Caribe': 2})
        self.assertEqual(self._totales(self.lider), {'ARC Caribe': 2, 'ARC Secreto': 1})
        self.assertEqual(self._totales(self.admin), {'ARC Caribe': 2, 'ARC Secreto': 1})
        self.assertTrue(oculta.pk)

