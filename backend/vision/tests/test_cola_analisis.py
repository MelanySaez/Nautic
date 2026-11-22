"""Photos over the concurrency limit wait in a queue that the worker drains as slots free up."""
from unittest import mock

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import TestCase, override_settings

from vision.cola import despachar_cola
from vision.models import Buque, FotoInspeccion, InspeccionCasco, SeccionCasco
from vision.tasks import procesar_foto
from vision.tests.utilidades import STORAGES_EN_MEMORIA, cliente_admin, png_bytes

IP = '127.0.0.1'


class _Base(TestCase):
    def setUp(self):
        self.insp = InspeccionCasco.objects.create(
            buque=Buque.objects.create(nombre='ARC Caribe', tipo='Fragata')
        )
        self.seccion = SeccionCasco.objects.create(
            buque=self.insp.buque, codigo='FWD-BTM', nombre='Fondo - Proa'
        )
        # Every catalog model is available.
        self._parchear('vision.views.motivo_no_disponible', return_value=None)

    def _parchear(self, objetivo, **kwargs):
        patcher = mock.patch(objetivo, **kwargs)
        mocked = patcher.start()
        self.addCleanup(patcher.stop)
        return mocked

    def _foto(self, estado=FotoInspeccion.Estado.PENDIENTE, **extra):
        return FotoInspeccion.objects.create(
            inspeccion=self.insp, seccion=self.seccion,
            imagen_original='inspecciones/originales/foto.png', estado=estado, **extra,
        )


class AnalizarEncolaTests(_Base):
    def setUp(self):
        super().setUp()
        self.client = cliente_admin()
        self.disparar = self._parchear('vision.views._disparar_procesamiento')
        self.concurrencia = self._parchear('vision.views.track_concurrent_start')
        # The queue drain the view runs at the end finds no free slot either.
        self._parchear('vision.cola.track_concurrent_start', return_value=(False, 'limite'))
        # No photo is in flight unless a test says so.
        self.activa = self._parchear('vision.views.foto_activa', return_value=False)
        self._parchear('vision.cola.foto_activa', return_value=False)

    def _analizar(self, payload=None):
        return self.client.post(
            f'/api/vision/inspecciones/{self.insp.id}/analizar/', payload or {}, format='json'
        )

    def test_las_fotos_sobre_el_limite_quedan_en_cola_con_el_modelo_elegido(self):
        primera, segunda, tercera = self._foto(), self._foto(), self._foto()
        self.concurrencia.side_effect = [(True, None), (True, None), (False, 'limite')]

        res = self._analizar({'modelo': 'rtdetr'})

        self.assertEqual(res.status_code, 202)
        self.assertEqual(res.json(), {'iniciadas': 2, 'omitidas_por_limite': 1})
        self.assertEqual([c.args[0] for c in self.disparar.call_args_list], [primera.id, segunda.id])
        for foto in (primera, segunda):
            foto.refresh_from_db()
            self.assertIsNone(foto.cola_ip)
            self.assertEqual(foto.modelo_id, 'rtdetr')
        tercera.refresh_from_db()
        self.assertEqual(tercera.cola_ip, IP)
        self.assertEqual(tercera.modelo_id, 'rtdetr')
        self.assertEqual(tercera.estado, FotoInspeccion.Estado.PENDIENTE)

    def test_sin_lugar_libre_todas_quedan_en_cola_y_responde_202(self):
        fotos = [self._foto(), self._foto()]
        self.concurrencia.return_value = (False, 'limite')

        res = self._analizar({'modelo': 'rtdetr'})

        self.assertEqual(res.status_code, 202)
        self.assertEqual(res.json(), {'iniciadas': 0, 'omitidas_por_limite': 2})
        self.disparar.assert_not_called()
        for foto in fotos:
            foto.refresh_from_db()
            self.assertEqual(foto.cola_ip, IP)
            self.assertEqual(foto.modelo_id, 'rtdetr')

    def test_al_final_lanza_las_encoladas_si_entretanto_se_libero_un_lugar(self):
        foto = self._foto()
        self.concurrencia.return_value = (False, 'limite')
        cola = self._parchear('vision.cola.track_concurrent_start', return_value=(True, None))
        lanzar = self._parchear('vision.cola._lanzar')

        res = self._analizar()

        self.assertEqual(res.status_code, 202)
        cola.assert_called_once_with(IP, foto.id)
        lanzar.assert_called_once_with(foto.id)
        foto.refresh_from_db()
        self.assertIsNone(foto.cola_ip)

    def test_pulsar_otra_vez_no_encola_ni_relanza_las_fotos_ya_lanzadas(self):
        # Launched photos stay `pendiente` until the worker picks them up.
        lanzada, nueva = self._foto(), self._foto()
        self.activa.side_effect = lambda foto_id: foto_id == lanzada.id
        self.concurrencia.return_value = (False, 'limite')

        res = self._analizar()

        self.assertEqual(res.status_code, 202)
        self.assertEqual(res.json(), {'iniciadas': 0, 'omitidas_por_limite': 1})
        self.disparar.assert_not_called()
        self.assertEqual([c.args[1] for c in self.concurrencia.call_args_list], [nueva.id])
        lanzada.refresh_from_db()
        nueva.refresh_from_db()
        self.assertIsNone(lanzada.cola_ip)
        self.assertEqual(nueva.cola_ip, IP)

    def test_el_conteo_no_cuenta_lanzamientos_de_otras_inspecciones(self):
        self._foto()
        self.concurrencia.return_value = (False, 'limite')
        # The drain at the end launched three queued photos (other inspections of the same IP).
        self._parchear('vision.views.despachar_cola', return_value=3)

        res = self._analizar()

        self.assertEqual(res.json(), {'iniciadas': 1, 'omitidas_por_limite': 0})

    def test_reintentar_una_foto_la_saca_de_la_cola(self):
        foto = self._foto(estado=FotoInspeccion.Estado.ERROR, cola_ip=IP)
        self.concurrencia.return_value = (True, None)

        res = self.client.post(f'/api/vision/fotos/{foto.id}/', {}, format='json')

        self.assertEqual(res.status_code, 202)
        foto.refresh_from_db()
        self.assertIsNone(foto.cola_ip)
        self.disparar.assert_called_once_with(foto.id)


class DespacharColaTests(_Base):
    def setUp(self):
        super().setUp()
        self.lanzar = self._parchear('vision.cola._lanzar')
        self.concurrencia = self._parchear('vision.cola.track_concurrent_start', return_value=(True, None))
        self.activa = self._parchear('vision.cola.foto_activa', return_value=False)

    def test_una_foto_encolada_que_ya_esta_en_marcha_sale_de_la_cola_sin_relanzarse(self):
        en_marcha, siguiente = self._foto(cola_ip=IP), self._foto(cola_ip=IP)
        self.activa.side_effect = lambda foto_id: foto_id == en_marcha.id

        self.assertEqual(despachar_cola(IP), 1)

        self.lanzar.assert_called_once_with(siguiente.id)
        self.assertEqual([c.args[1] for c in self.concurrencia.call_args_list], [siguiente.id])
        en_marcha.refresh_from_db()
        self.assertIsNone(en_marcha.cola_ip)

    def test_si_falla_al_guardar_libera_el_lugar_tomado(self):
        foto = self._foto(cola_ip=IP)
        fin = self._parchear('vision.cola.track_concurrent_end')

        with mock.patch.object(FotoInspeccion, 'save', side_effect=RuntimeError('db caída')):
            self.assertEqual(despachar_cola(IP), 0)

        fin.assert_called_once_with(foto.id)
        self.lanzar.assert_not_called()

    def test_lanza_las_encoladas_de_esa_ip_por_orden_mientras_haya_lugar(self):
        primera, segunda, tercera = (self._foto(cola_ip=IP) for _ in range(3))
        self.concurrencia.side_effect = [(True, None), (True, None), (False, 'limite')]

        lanzadas = despachar_cola(IP)

        self.assertEqual(lanzadas, 2)
        self.assertEqual([c.args[0] for c in self.lanzar.call_args_list], [primera.id, segunda.id])
        for foto, en_cola in ((primera, None), (segunda, None), (tercera, IP)):
            foto.refresh_from_db()
            self.assertEqual(foto.cola_ip, en_cola)

    def test_solo_toma_fotos_pendientes_de_la_misma_ip(self):
        otra_ip = self._foto(cola_ip='10.0.0.9')
        ya_en_proceso = self._foto(estado=FotoInspeccion.Estado.EN_PROCESO, cola_ip=IP)
        fuera_de_cola = self._foto()

        self.assertEqual(despachar_cola(IP), 0)

        self.lanzar.assert_not_called()
        otra_ip.refresh_from_db()
        self.assertEqual(otra_ip.cola_ip, '10.0.0.9')
        ya_en_proceso.refresh_from_db()
        fuera_de_cola.refresh_from_db()
        self.assertEqual(ya_en_proceso.cola_ip, IP)
        self.assertIsNone(fuera_de_cola.cola_ip)

    def test_sin_ip_conocida_no_hace_nada(self):
        self._foto(cola_ip=IP)

        for ip in (None, '', mock.MagicMock()):
            self.assertEqual(despachar_cola(ip), 0)

        self.lanzar.assert_not_called()
        self.concurrencia.assert_not_called()

    def test_si_falla_el_lanzamiento_la_foto_vuelve_a_la_cola_y_libera_el_lugar(self):
        foto = self._foto(cola_ip=IP)
        self.lanzar.side_effect = RuntimeError('broker caído')
        fin = self._parchear('vision.cola.track_concurrent_end')

        self.assertEqual(despachar_cola(IP), 0)

        foto.refresh_from_db()
        self.assertEqual(foto.cola_ip, IP)
        fin.assert_called_once_with(foto.id)


@override_settings(STORAGES=STORAGES_EN_MEMORIA)
class WorkerDespachaColaTests(TestCase):
    """The worker hands every released slot to the next queued photo of the same IP."""

    def setUp(self):
        insp = InspeccionCasco.objects.create(
            buque=Buque.objects.create(nombre='ARC Caribe', tipo='Fragata')
        )
        seccion = SeccionCasco.objects.create(buque=insp.buque, codigo='FWD-BTM', nombre='Fondo - Proa')
        clave = default_storage.save('inspecciones/originales/foto.png', ContentFile(png_bytes()))
        self.foto = FotoInspeccion.objects.create(inspeccion=insp, seccion=seccion, imagen_original=clave)
        self._parchear('vision.tasks.publicar_evento')
        self.fin = self._parchear('vision.tasks.track_concurrent_end', return_value=IP)
        self.despachar = self._parchear('vision.tasks.despachar_cola')

    def _parchear(self, objetivo, **kwargs):
        patcher = mock.patch(objetivo, **kwargs)
        mocked = patcher.start()
        self.addCleanup(patcher.stop)
        return mocked

    def test_al_terminar_bien_continua_la_cola(self):
        resultado = {'detections': [], 'inference_time_ms': 1.0}
        with mock.patch('vision.tasks.run_inference', return_value=(b'anotada', resultado)):
            procesar_foto.apply(args=[self.foto.id]).get()

        self.fin.assert_called_once_with(self.foto.id)
        self.despachar.assert_called_once_with(IP)

    def test_al_fallar_definitivamente_continua_la_cola(self):
        self._parchear('vision.tasks.dead_letter')
        with mock.patch('vision.tasks.run_inference', side_effect=ValueError('modelo roto')):
            with self.assertRaises(ValueError):
                procesar_foto.apply(args=[self.foto.id]).get()

        self.fin.assert_called_once_with(self.foto.id)
        self.despachar.assert_called_once_with(IP)

    def test_un_reintento_por_error_de_lectura_no_libera_ni_continua_la_cola(self):
        with mock.patch('vision.tasks.run_inference', side_effect=OSError('disco')):
            with mock.patch.object(procesar_foto, 'retry', side_effect=OSError('reintento')):
                with self.assertRaises(OSError):
                    procesar_foto.apply(args=[self.foto.id], retries=0).get()

        self.fin.assert_not_called()
        self.despachar.assert_not_called()

    def test_una_foto_ya_completada_tambien_continua_la_cola(self):
        self.foto.estado = FotoInspeccion.Estado.COMPLETADA
        self.foto.save(update_fields=['estado'])

        procesar_foto.apply(args=[self.foto.id]).get()

        self.despachar.assert_called_once_with(IP)

    def test_una_foto_borrada_tambien_continua_la_cola(self):
        foto_id = self.foto.id
        self.foto.delete()

        procesar_foto.apply(args=[foto_id]).get()

        self.fin.assert_called_once_with(foto_id)
        self.despachar.assert_called_once_with(IP)
