"""Streaming authorization uses current inspection and membership state."""
import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from vision.models import Buque, InspeccionCasco, InspeccionMiembro


@override_settings(SSE_KEEPALIVE_SECONDS=0)
class StreamPermisosTests(TestCase):
    def setUp(self):
        self.lider = get_user_model().objects.create_user('lider@x.com', None)
        self.lector = get_user_model().objects.create_user('lector@x.com', None)
        self.buque = Buque.objects.create(nombre='ARC Caribe', tipo='Fragata')
        self.client.force_login(self.lector)
        # Response.close must not close TestCase's enclosing transaction.
        cierre = mock.patch('django.http.response.signals.request_finished.send')
        cierre.start()
        self.addCleanup(cierre.stop)
        self.pubsub = mock.Mock()
        parche = mock.patch('vision.views.suscribirse', return_value=self.pubsub)
        self.suscribirse = parche.start()
        self.addCleanup(parche.stop)

    def _abrir(self, privada=False, miembro=False):
        self.insp = InspeccionCasco.objects.create(buque=self.buque, lider=self.lider, privada=privada)
        if miembro:
            InspeccionMiembro.objects.create(inspeccion=self.insp, usuario=self.lector, rol='observador')
        self.respuesta = self.client.get(f'/api/vision/inspecciones/{self.insp.pk}/stream/')
        self.addCleanup(self.respuesta.close)
        self.assertEqual(self.respuesta.status_code, 200)
        self.stream = iter(self.respuesta.streaming_content)

    def _handshake(self):
        self.assertIn(b'event: ready', next(self.stream))
        self.assertEqual(next(self.stream), b'retry: 5000\n\n')

    def _mensaje(self):
        return {'type': 'message', 'data': json.dumps({'event': 'foto-updated', 'data': {'id': 7}})}

    def test_revocacion_cierra_antes_del_evento_y_del_keepalive(self):
        for cambio in ('privada', 'quitar_miembro', 'borrar'):
            for mensaje in (self._mensaje(), None):
                with self.subTest(cambio=cambio, mensaje=mensaje):
                    self.pubsub.reset_mock()
                    self._abrir(privada=cambio == 'quitar_miembro', miembro=cambio == 'quitar_miembro')
                    self._handshake()

                    def revocar(timeout):
                        if cambio == 'privada':
                            InspeccionCasco.objects.filter(pk=self.insp.pk).update(privada=True)
                        elif cambio == 'quitar_miembro':
                            self.insp.miembros.all().delete()
                        else:
                            self.insp.delete()
                        return mensaje

                    self.pubsub.get_message.side_effect = revocar
                    self.assertIsNone(next(self.stream, None))
                    self.pubsub.close.assert_called_once_with()

    def test_miembro_autorizado_sigue_recibiendo_eventos_y_keepalives(self):
        self._abrir(privada=True, miembro=True)
        self._handshake()
        self.pubsub.get_message.return_value = self._mensaje()

        evento = next(self.stream)
        self.assertIn(b'event: foto-updated', evento)
        self.assertIn(b'data: {"id": 7}', evento)
        self.assertEqual(next(self.stream), b':keepalive\n\n')
        self.pubsub.close.assert_not_called()
        self.respuesta.close()
        self.pubsub.close.assert_called_once_with()

    def test_cierre_durante_handshake_libera_pubsub(self):
        for frames in (1, 2):
            with self.subTest(frames=frames):
                self.pubsub.reset_mock()
                self._abrir()
                for _ in range(frames):
                    next(self.stream)
                self.respuesta.close()
                self.pubsub.close.assert_called_once_with()

    def test_privacidad_cambiada_antes_del_handshake_cierra_sin_datos(self):
        self._abrir()
        InspeccionCasco.objects.filter(pk=self.insp.pk).update(privada=True)
        self.assertIsNone(next(self.stream, None))
        self.pubsub.close.assert_called_once_with()

    def test_cuenta_desactivada_cierra_antes_del_evento(self):
        self._abrir()
        self._handshake()
        get_user_model().objects.filter(pk=self.lector.pk).update(is_active=False)
        self.pubsub.get_message.return_value = self._mensaje()
        self.assertIsNone(next(self.stream, None))
        self.pubsub.close.assert_called_once_with()
