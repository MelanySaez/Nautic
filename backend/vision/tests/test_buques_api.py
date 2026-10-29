from django.test import TestCase
from rest_framework.test import APIClient

from vision.models import Buque

URL_LISTA = '/api/buques/'


def _url_detalle(buque_id):
    return f'/api/buques/{buque_id}/'


class CrearBuqueTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def _post(self, payload):
        return self.client.post(URL_LISTA, payload, format='json')

    def test_crea_buque_con_datos_completos(self):
        payload = {
            'nombre': '  ARC Caribe  ',
            'tipo': 'Fragata',
            'descripcion': 'Buque de prueba',
            'etapa': 'En construcción',
            'imagen': 'caribe.png',
            'autonomia_horas': 120,
            'eslora_total_m': 110.5,
            'desplazamiento_ton': 1900,
            'rondas_config': {'intervalo': 4},
            'documentos': [{'nombre': 'plano.pdf'}],
            'contexto_operacional': {'zona': 'Caribe'},
            'misiones': ['patrulla'],
            'grupos_constructivos': [{'codigo': '100'}],
        }
        res = self._post(payload)

        self.assertEqual(res.status_code, 201)
        body = res.json()
        self.assertEqual(body['nombre'], 'ARC Caribe')
        self.assertEqual(body['tipo'], 'Fragata')
        self.assertEqual(body['etapa'], 'En construcción')
        self.assertEqual(body['eslora_total_m'], 110.5)
        self.assertEqual(body['rondas_config'], {'intervalo': 4})
        self.assertEqual(body['misiones'], ['patrulla'])
        self.assertIsNone(body['puntal_m'])
        self.assertIn('created_at', body)
        self.assertIn('updated_at', body)

        buque = Buque.objects.get(pk=body['id'])
        self.assertEqual(buque.nombre, 'ARC Caribe')
        self.assertEqual(buque.autonomia_horas, 120)
        self.assertEqual(buque.documentos, [{'nombre': 'plano.pdf'}])

    def test_crea_buque_solo_con_requeridos_usa_defaults(self):
        res = self._post({'nombre': 'Lancha', 'tipo': 'Patrullera'})

        self.assertEqual(res.status_code, 201)
        body = res.json()
        self.assertEqual(body['etapa'], 'Activo')
        self.assertEqual(body['rondas_config'], {})
        self.assertEqual(body['documentos'], [])
        self.assertEqual(body['descripcion'], '')

    def test_acepta_nulos_en_campos_opcionales(self):
        res = self._post({'nombre': 'A', 'tipo': 'B', 'imagen': None, 'puntal_m': None})

        self.assertEqual(res.status_code, 201)

    def test_falta_nombre(self):
        res = self._post({'tipo': 'Fragata'})

        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()['error'], 'Datos inválidos.')
        self.assertIn('nombre', res.json()['campos'])
        self.assertEqual(Buque.objects.count(), 0)

    def test_falta_tipo(self):
        res = self._post({'nombre': 'ARC Caribe'})

        self.assertEqual(res.status_code, 400)
        self.assertIn('tipo', res.json()['campos'])
        self.assertNotIn('nombre', res.json()['campos'])

    def test_nombre_en_blanco(self):
        res = self._post({'nombre': '   ', 'tipo': 'Fragata'})

        self.assertEqual(res.status_code, 400)
        self.assertIn('nombre', res.json()['campos'])
        self.assertEqual(Buque.objects.count(), 0)

    def test_nombre_no_es_texto(self):
        res = self._post({'nombre': 123, 'tipo': 'Fragata'})

        self.assertEqual(res.status_code, 400)
        self.assertIn('nombre', res.json()['campos'])

    def test_nombre_demasiado_largo(self):
        res = self._post({'nombre': 'x' * 256, 'tipo': 'Fragata'})

        self.assertEqual(res.status_code, 400)
        self.assertIn('nombre', res.json()['campos'])

    def test_campo_desconocido(self):
        res = self._post({'nombre': 'A', 'tipo': 'B', 'color': 'gris'})

        self.assertEqual(res.status_code, 400)
        self.assertIn('color', res.json()['campos'])
        self.assertEqual(Buque.objects.count(), 0)

    def test_campos_de_solo_lectura_se_rechazan(self):
        for campo in ('id', 'created_at', 'updated_at'):
            with self.subTest(campo=campo):
                res = self._post({'nombre': 'A', 'tipo': 'B', campo: 1})

                self.assertEqual(res.status_code, 400)
                self.assertIn(campo, res.json()['campos'])

    def test_json_con_contenedor_incorrecto(self):
        casos = {
            'rondas_config': [],
            'contexto_operacional': 'texto',
            'documentos': {},
            'misiones': 'a',
            'grupos_constructivos': None,
        }
        for campo, valor in casos.items():
            with self.subTest(campo=campo):
                res = self._post({'nombre': 'A', 'tipo': 'B', campo: valor})

                self.assertEqual(res.status_code, 400)
                self.assertIn(campo, res.json()['campos'])

    def test_numerico_no_numerico(self):
        res = self._post({'nombre': 'A', 'tipo': 'B', 'eslora_total_m': 'larga'})

        self.assertEqual(res.status_code, 400)
        self.assertIn('eslora_total_m', res.json()['campos'])

    def test_entero_con_decimales(self):
        res = self._post({'nombre': 'A', 'tipo': 'B', 'autonomia_horas': 1.5})

        self.assertEqual(res.status_code, 400)
        self.assertIn('autonomia_horas', res.json()['campos'])

    def test_numerico_negativo(self):
        for campo in ('puntal_m', 'autonomia_dias'):
            with self.subTest(campo=campo):
                res = self._post({'nombre': 'A', 'tipo': 'B', campo: -1})

                self.assertEqual(res.status_code, 400)
                self.assertIn(campo, res.json()['campos'])

    def test_numerico_booleano(self):
        for campo in ('puntal_m', 'autonomia_dias'):
            with self.subTest(campo=campo):
                res = self._post({'nombre': 'A', 'tipo': 'B', campo: True})

                self.assertEqual(res.status_code, 400)
                self.assertIn(campo, res.json()['campos'])

    def test_entero_fuera_de_rango(self):
        res = self._post({'nombre': 'A', 'tipo': 'B', 'autonomia_horas': 10 ** 12})

        self.assertEqual(res.status_code, 400)
        self.assertIn('autonomia_horas', res.json()['campos'])

    def test_decimal_demasiado_grande(self):
        res = self._post({'nombre': 'A', 'tipo': 'B', 'eslora_total_m': 10 ** 400})

        self.assertEqual(res.status_code, 400)
        self.assertIn('eslora_total_m', res.json()['campos'])

    def test_varios_errores_se_reportan_juntos(self):
        res = self._post({'nombre': '', 'puntal_m': -2})

        campos = res.json()['campos']
        self.assertEqual(res.status_code, 400)
        self.assertEqual(set(campos), {'nombre', 'tipo', 'puntal_m'})

    def test_cuerpo_que_no_es_objeto(self):
        res = self._post([1, 2, 3])

        self.assertEqual(res.status_code, 400)
        self.assertIn('error', res.json())


class ListarBuquesTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_lista_vacia(self):
        res = self.client.get(URL_LISTA)

        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            res.json(), {'total': 0, 'offset': 0, 'limit': 50, 'resultados': []},
        )

    def test_orden_por_nombre_y_resumen(self):
        Buque.objects.create(nombre='Zeta', tipo='T')
        Buque.objects.create(nombre='Alfa', tipo='T', imagen='a.png')
        Buque.objects.create(nombre='Mike', tipo='T')

        body = self.client.get(URL_LISTA).json()

        self.assertEqual(body['total'], 3)
        self.assertEqual([b['nombre'] for b in body['resultados']], ['Alfa', 'Mike', 'Zeta'])
        self.assertEqual(
            set(body['resultados'][0]),
            {'id', 'nombre', 'tipo', 'etapa', 'imagen', 'created_at', 'updated_at'},
        )
        self.assertEqual(body['resultados'][0]['imagen'], 'a.png')

    def test_nombres_iguales_se_ordenan_por_id(self):
        a = Buque.objects.create(nombre='Igual', tipo='T')
        b = Buque.objects.create(nombre='Igual', tipo='T')

        ids = [x['id'] for x in self.client.get(URL_LISTA).json()['resultados']]

        self.assertEqual(ids, [a.id, b.id])

    def test_paginacion_offset_limit(self):
        for i in range(5):
            Buque.objects.create(nombre=f'B{i}', tipo='T')

        body = self.client.get(URL_LISTA, {'offset': 1, 'limit': 2}).json()

        self.assertEqual(body['total'], 5)
        self.assertEqual(body['offset'], 1)
        self.assertEqual(body['limit'], 2)
        self.assertEqual([b['nombre'] for b in body['resultados']], ['B1', 'B2'])

    def test_offset_mas_alla_del_total(self):
        Buque.objects.create(nombre='B', tipo='T')

        body = self.client.get(URL_LISTA, {'offset': 10}).json()

        self.assertEqual(body['total'], 1)
        self.assertEqual(body['resultados'], [])

    def test_limit_maximo_aceptado(self):
        res = self.client.get(URL_LISTA, {'limit': 200})

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['limit'], 200)

    def test_parametros_invalidos(self):
        casos = [
            {'offset': -1},
            {'offset': 'abc'},
            {'offset': '1.5'},
            {'offset': '9' * 5000},
            {'offset': 2_147_483_648},
            {'limit': 0},
            {'limit': -5},
            {'limit': 201},
            {'limit': 'x'},
            {'limit': ''},
        ]
        for params in casos:
            with self.subTest(params=params):
                res = self.client.get(URL_LISTA, params)

                self.assertEqual(res.status_code, 400)
                self.assertIn('error', res.json())


class DetalleBuqueTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_detalle_completo(self):
        buque = Buque.objects.create(
            nombre='ARC Caribe', tipo='Fragata', eslora_total_m=110.5,
            misiones=['patrulla'],
        )

        res = self.client.get(_url_detalle(buque.id))

        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body['id'], buque.id)
        self.assertEqual(body['nombre'], 'ARC Caribe')
        self.assertEqual(body['eslora_total_m'], 110.5)
        self.assertEqual(body['misiones'], ['patrulla'])
        self.assertEqual(body['created_at'], buque.created_at.isoformat())
        for campo in ('descripcion', 'etapa', 'rondas_config', 'documentos',
                      'contexto_operacional', 'grupos_constructivos', 'puntal_m',
                      'updated_at'):
            self.assertIn(campo, body)

    def test_detalle_inexistente(self):
        res = self.client.get(_url_detalle(999999))

        self.assertEqual(res.status_code, 404)
