"""Model selection on analyze: ``modelo`` on /analizar/, photo retry and the worker."""
from unittest import mock

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from vision import inference
from vision.models import Buque, FotoInspeccion, InspeccionCasco, SeccionCasco
from vision.tasks import procesar_foto
from vision.tests.utilidades import STORAGES_EN_MEMORIA, png_bytes

IDS_CATALOGO = ['yolo-seg', 'yolo-tiled', 'maskrcnn', 'rtdetr']


class _Base(TestCase):
    """Redis, the broker and the real model availability are all stubbed."""

    def setUp(self):
        self.client = APIClient()
        self.insp = InspeccionCasco.objects.create(
            buque=Buque.objects.create(nombre='ARC Caribe', tipo='Fragata')
        )
        self.seccion = SeccionCasco.objects.create(
            buque=self.insp.buque, codigo='FWD-BTM', nombre='Fondo - Proa'
        )
        self.disparar = self._parchear('vision.views._disparar_procesamiento')
        self.concurrencia = self._parchear(
            'vision.views.track_concurrent_start', return_value=(True, None)
        )
        # Every catalog model is available unless a test says otherwise.
        self.motivo = self._parchear('vision.views.motivo_no_disponible', return_value=None)

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

    def _analizar(self, payload=None, **kwargs):
        kwargs.setdefault('format', 'json')
        return self.client.post(
            f'/api/vision/inspecciones/{self.insp.id}/analizar/', payload or {}, **kwargs
        )


class AnalizarConModeloTests(_Base):
    @override_settings(VISION_MODEL_ID='yolo-tiled')
    def test_sin_modelo_usa_el_por_defecto_de_la_configuracion(self):
        fotos = [self._foto(), self._foto()]

        res = self._analizar()

        self.assertEqual(res.status_code, 202)
        self.assertEqual(res.json(), {'iniciadas': 2, 'omitidas_por_limite': 0})
        for foto in fotos:
            foto.refresh_from_db()
            self.assertEqual(foto.modelo_id, 'yolo-tiled')
        self.assertEqual(self.disparar.call_count, 2)

    def test_modelo_explicito_se_guarda_en_cada_foto_pendiente(self):
        fotos = [self._foto(), self._foto()]

        res = self._analizar({'modelo': 'rtdetr'})

        self.assertEqual(res.status_code, 202)
        for foto in fotos:
            foto.refresh_from_db()
            self.assertEqual(foto.modelo_id, 'rtdetr')
        self.motivo.assert_called_once_with('rtdetr')

    def test_el_modelo_se_guarda_antes_de_encolar(self):
        foto = self._foto()
        vistos = []
        self.disparar.side_effect = lambda foto_id: vistos.append(
            FotoInspeccion.objects.get(pk=foto_id).modelo_id
        )

        self._analizar({'modelo': 'maskrcnn'})

        self.assertEqual(vistos, ['maskrcnn'])
        self.disparar.assert_called_once_with(foto.id)

    def test_acepta_formulario_ademas_de_json(self):
        foto = self._foto()

        res = self._analizar({'modelo': 'maskrcnn'}, format='multipart')

        self.assertEqual(res.status_code, 202)
        foto.refresh_from_db()
        self.assertEqual(foto.modelo_id, 'maskrcnn')

    def test_modelo_en_blanco_se_recorta_y_valida(self):
        foto = self._foto()

        res = self._analizar({'modelo': '  rtdetr  '})

        self.assertEqual(res.status_code, 202)
        foto.refresh_from_db()
        self.assertEqual(foto.modelo_id, 'rtdetr')

    def test_modelo_desconocido_es_400_y_no_cambia_nada(self):
        foto = self._foto()

        res = self._analizar({'modelo': 'gpt-9'})

        self.assertEqual(res.status_code, 400)
        body = res.json()
        self.assertEqual(body['error'], 'Datos inválidos.')
        self.assertEqual(list(body['campos']), ['modelo'])
        for id_modelo in IDS_CATALOGO:
            self.assertIn(id_modelo, body['campos']['modelo'][0])
        self.disparar.assert_not_called()
        foto.refresh_from_db()
        self.assertIsNone(foto.modelo_id)

    def test_modelo_vacio_es_desconocido(self):
        self._foto()

        res = self._analizar({'modelo': ''})

        self.assertEqual(res.status_code, 400)
        self.assertIn('modelo', res.json()['campos'])

    def test_modelo_que_no_es_texto_es_400(self):
        self._foto()

        res = self._analizar({'modelo': 123})

        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()['campos'], {'modelo': ['Debe ser texto.']})
        self.disparar.assert_not_called()

    def test_cuerpo_que_no_es_un_objeto_es_400(self):
        self._foto()

        res = self._analizar(['rtdetr'])

        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json(), {'error': 'Se esperaba un objeto JSON.'})
        self.disparar.assert_not_called()

    def test_modelo_no_disponible_es_400_y_no_encola_nada(self):
        fotos = [self._foto(), self._foto()]
        self.motivo.return_value = 'Faltan los pesos del modelo en el servidor.'

        res = self._analizar({'modelo': 'maskrcnn'})

        self.assertEqual(res.status_code, 400)
        body = res.json()
        self.assertEqual(body['error'], 'Modelo no disponible.')
        self.assertEqual(
            body['campos']['modelo'],
            ['El modelo "maskrcnn" no está disponible. Faltan los pesos del modelo en el servidor.'],
        )
        self.disparar.assert_not_called()
        self.concurrencia.assert_not_called()
        for foto in fotos:
            foto.refresh_from_db()
            self.assertIsNone(foto.modelo_id)

    def test_motivo_de_core_engine_llega_al_cliente_sin_rutas(self):
        from core_engine.vision import ModelAvailability

        self._foto()
        # Real reason builder over a core_engine availability report.
        self.motivo.side_effect = inference.motivo_no_disponible
        faltante = ModelAvailability(
            model_id='maskrcnn', available=False, missing_weights=('maskrcnn-0.2.0.pt',),
        )
        with mock.patch('vision.inference.model_availability', return_value=faltante):
            res = self._analizar({'modelo': 'maskrcnn'})

        self.assertEqual(res.status_code, 400)
        self.assertEqual(
            res.json()['campos']['modelo'],
            ['El modelo "maskrcnn" no está disponible. '
             'Faltan los pesos del modelo en el servidor: maskrcnn-0.2.0.pt.'],
        )
        self.disparar.assert_not_called()

    def test_el_modelo_por_defecto_tambien_se_valida(self):
        self._foto()
        self.motivo.return_value = 'Faltan dependencias del modelo en el servidor.'

        res = self._analizar()

        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()['error'], 'Modelo no disponible.')
        self.disparar.assert_not_called()

    def test_sin_fotos_pendientes_sigue_siendo_400(self):
        self._foto(estado=FotoInspeccion.Estado.COMPLETADA, modelo_id='yolo-seg')

        res = self._analizar({'modelo': 'rtdetr'})

        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json(), {'error': 'No hay fotos pendientes de análisis.'})

    def test_no_toca_las_fotos_que_no_estan_pendientes(self):
        hecha = self._foto(estado=FotoInspeccion.Estado.COMPLETADA, modelo_id='yolo-seg')
        self._foto()

        self._analizar({'modelo': 'rtdetr'})

        hecha.refresh_from_db()
        self.assertEqual(hecha.modelo_id, 'yolo-seg')

    def test_fotos_omitidas_por_el_limite_no_cambian_de_modelo(self):
        primera, segunda = self._foto(), self._foto()
        self.concurrencia.side_effect = [(True, None), (False, 'limite')]

        res = self._analizar({'modelo': 'rtdetr'})

        self.assertEqual(res.status_code, 202)
        self.assertEqual(res.json(), {'iniciadas': 1, 'omitidas_por_limite': 1})
        primera.refresh_from_db()
        segunda.refresh_from_db()
        self.assertEqual(primera.modelo_id, 'rtdetr')
        self.assertIsNone(segunda.modelo_id)

    def test_limite_alcanzado_sigue_siendo_429(self):
        foto = self._foto()
        self.concurrencia.return_value = (False, 'limite')

        res = self._analizar({'modelo': 'rtdetr'})

        self.assertEqual(res.status_code, 429)
        foto.refresh_from_db()
        self.assertIsNone(foto.modelo_id)

    def test_inspeccion_inexistente_es_404(self):
        res = self.client.post('/api/vision/inspecciones/999999/analizar/', {}, format='json')

        self.assertEqual(res.status_code, 404)


class ReintentarConModeloTests(_Base):
    def _reintentar(self, foto, payload=None):
        return self.client.post(
            f'/api/vision/fotos/{foto.id}/', payload or {}, format='json'
        )

    def test_modelo_explicito_se_guarda_y_la_foto_vuelve_a_pendiente(self):
        foto = self._foto(
            estado=FotoInspeccion.Estado.ERROR, error_detalle='boom', modelo_id='yolo-seg'
        )

        res = self._reintentar(foto, {'modelo': 'rtdetr'})

        self.assertEqual(res.status_code, 202)
        self.assertEqual(res.json()['modelo'], 'rtdetr')
        foto.refresh_from_db()
        self.assertEqual(foto.modelo_id, 'rtdetr')
        self.assertEqual(foto.estado, FotoInspeccion.Estado.PENDIENTE)
        self.assertIsNone(foto.error_detalle)
        self.disparar.assert_called_once_with(foto.id)

    def test_sin_modelo_conserva_el_de_la_foto(self):
        foto = self._foto(estado=FotoInspeccion.Estado.ERROR, modelo_id='maskrcnn')

        res = self._reintentar(foto)

        self.assertEqual(res.status_code, 202)
        foto.refresh_from_db()
        self.assertEqual(foto.modelo_id, 'maskrcnn')
        self.motivo.assert_called_once_with('maskrcnn')

    @override_settings(VISION_MODEL_ID='yolo-seg')
    def test_sin_modelo_ni_historial_usa_el_por_defecto(self):
        foto = self._foto(estado=FotoInspeccion.Estado.ERROR)

        res = self._reintentar(foto)

        self.assertEqual(res.status_code, 202)
        foto.refresh_from_db()
        self.assertEqual(foto.modelo_id, 'yolo-seg')

    def test_modelo_desconocido_es_400_y_la_foto_no_cambia(self):
        foto = self._foto(estado=FotoInspeccion.Estado.ERROR, error_detalle='boom')

        res = self._reintentar(foto, {'modelo': 'gpt-9'})

        self.assertEqual(res.status_code, 400)
        self.assertIn('modelo', res.json()['campos'])
        self.disparar.assert_not_called()
        foto.refresh_from_db()
        self.assertEqual(foto.estado, FotoInspeccion.Estado.ERROR)
        self.assertEqual(foto.error_detalle, 'boom')
        self.assertIsNone(foto.modelo_id)

    def test_modelo_no_disponible_es_400_y_la_foto_no_cambia(self):
        foto = self._foto(estado=FotoInspeccion.Estado.ERROR, modelo_id='yolo-seg')
        self.motivo.return_value = 'Faltan los pesos del modelo en el servidor.'

        res = self._reintentar(foto, {'modelo': 'rtdetr'})

        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()['error'], 'Modelo no disponible.')
        self.disparar.assert_not_called()
        foto.refresh_from_db()
        self.assertEqual(foto.estado, FotoInspeccion.Estado.ERROR)
        self.assertEqual(foto.modelo_id, 'yolo-seg')

    def test_limite_de_concurrencia_no_cambia_el_modelo(self):
        foto = self._foto(estado=FotoInspeccion.Estado.ERROR, modelo_id='yolo-seg')
        self.concurrencia.return_value = (False, 'limite')

        res = self._reintentar(foto, {'modelo': 'rtdetr'})

        self.assertEqual(res.status_code, 429)
        foto.refresh_from_db()
        self.assertEqual(foto.modelo_id, 'yolo-seg')

    def test_foto_completada_sigue_sin_poder_reintentarse(self):
        foto = self._foto(estado=FotoInspeccion.Estado.COMPLETADA, modelo_id='yolo-seg')

        res = self._reintentar(foto, {'modelo': 'rtdetr'})

        self.assertEqual(res.status_code, 400)
        foto.refresh_from_db()
        self.assertEqual(foto.modelo_id, 'yolo-seg')

    def test_el_detalle_de_la_foto_expone_el_modelo(self):
        foto = self._foto(modelo_id='rtdetr')

        res = self.client.get(f'/api/vision/fotos/{foto.id}/')

        self.assertEqual(res.json()['modelo'], 'rtdetr')

    def test_foto_sin_analisis_pedido_expone_modelo_nulo(self):
        foto = self._foto()

        res = self.client.get(f'/api/vision/inspecciones/{self.insp.id}/')

        self.assertEqual(res.json()['fotos'][0]['id'], foto.id)
        self.assertIsNone(res.json()['fotos'][0]['modelo'])


@override_settings(STORAGES=STORAGES_EN_MEMORIA)
class TareaConModeloTests(TestCase):
    def setUp(self):
        insp = InspeccionCasco.objects.create(
            buque=Buque.objects.create(nombre='ARC Caribe', tipo='Fragata')
        )
        seccion = SeccionCasco.objects.create(buque=insp.buque, codigo='FWD-BTM', nombre='Fondo - Proa')
        clave = default_storage.save('inspecciones/originales/foto.png', ContentFile(png_bytes()))
        self.foto = FotoInspeccion.objects.create(
            inspeccion=insp, seccion=seccion, imagen_original=clave,
        )
        self.eventos = self._parchear('vision.tasks.publicar_evento')
        self._parchear('vision.tasks.track_concurrent_end')

    def _parchear(self, objetivo):
        patcher = mock.patch(objetivo)
        mocked = patcher.start()
        self.addCleanup(patcher.stop)
        return mocked

    def _procesar(self):
        resultado = {'detections': [], 'inference_time_ms': 1.0}
        with mock.patch('vision.tasks.run_inference', return_value=(b'anotada', resultado)) as run:
            procesar_foto.apply(args=[self.foto.id]).get()
        return run

    def test_analiza_con_el_modelo_de_la_foto(self):
        self.foto.modelo_id = 'rtdetr'
        self.foto.save(update_fields=['modelo_id'])

        run = self._procesar()

        run.assert_called_once_with(png_bytes(), model_id='rtdetr')

    @override_settings(VISION_MODEL_ID='maskrcnn')
    def test_foto_sin_modelo_usa_el_por_defecto(self):
        run = self._procesar()

        run.assert_called_once_with(png_bytes(), model_id='maskrcnn')

    def test_los_eventos_sse_llevan_el_modelo(self):
        self.foto.modelo_id = 'yolo-tiled'
        self.foto.save(update_fields=['modelo_id'])

        self._procesar()

        cargas = [c.kwargs['data'] for c in self.eventos.call_args_list]
        self.assertTrue(cargas)
        for carga in cargas:
            self.assertEqual(carga['modelo'], 'yolo-tiled')


class RunInferenceTests(TestCase):
    def _llamar(self, **kwargs):
        resultado = {'detections': [{'class_name': 'corrosion', 'mask': {'size': [1, 1]}}]}
        with mock.patch('core_engine.vision.analyze', return_value=(b'jpg', resultado)) as analyze:
            inference.run_inference(b'img', **kwargs)
        return analyze

    @override_settings(VISION_MODEL_ID='yolo-seg')
    def test_sin_model_id_usa_el_de_la_configuracion(self):
        analyze = self._llamar()

        self.assertEqual(analyze.call_args.kwargs['model_id'], 'yolo-seg')

    def test_model_id_explicito_gana_sobre_la_configuracion(self):
        analyze = self._llamar(model_id='rtdetr')

        self.assertEqual(analyze.call_args.kwargs['model_id'], 'rtdetr')

    def test_sin_confianza_cada_modelo_usa_la_suya(self):
        analyze = self._llamar(model_id='maskrcnn')

        self.assertIsNone(analyze.call_args.kwargs['confidence'])

    def test_confianza_explicita_se_respeta(self):
        analyze = self._llamar(confidence=0.4)

        self.assertEqual(analyze.call_args.kwargs['confidence'], 0.4)
