import base64
import json
from datetime import datetime

from django.test import TestCase
from rest_framework.test import APIClient

from vision.busqueda import (
    BusquedaInvalida,
    FILTROS,
    buscar_inspecciones,
    codificar_cursor,
    describir_filtros,
)
from vision.models import Buque, FotoInspeccion, InspeccionCasco, SeccionCasco

URL = '/api/vision/inspecciones/'


def _crear(buque, nombre='', fecha=None, severidad=None):
    insp = InspeccionCasco.objects.create(buque=buque, nombre=nombre, severidad_max=severidad)
    if fecha is not None:
        # fecha_creacion es auto_now_add: solo se puede fijar con update().
        InspeccionCasco.objects.filter(pk=insp.pk).update(fecha_creacion=fecha)
        insp.refresh_from_db()
    return insp


class BusquedaBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.caribe = Buque.objects.create(nombre='ARC Caribe', tipo='Fragata')
        self.gorgona = Buque.objects.create(nombre='ARC Gorgona', tipo='Patrullera')

    def _get(self, **params):
        return self.client.get(URL, params)

    def _ids(self, **params):
        res = self._get(**params)
        self.assertEqual(res.status_code, 200, res.content)
        return [r['id'] for r in res.json()['resultados']]


class FormaDeRespuestaTests(BusquedaBase):
    def test_lista_vacia(self):
        body = self._get().json()

        self.assertEqual(body, {'resultados': [], 'siguiente': None, 'hay_mas': False})

    def test_resultado_incluye_nombre_severidad_y_total_fotos(self):
        insp = _crear(self.caribe, nombre='Dique', severidad=3)
        seccion = SeccionCasco.objects.create(codigo='FWD-BTM', nombre='Fondo')
        for _ in range(2):
            FotoInspeccion.objects.create(
                inspeccion=insp, seccion=seccion, imagen_original='media/x.jpg',
            )

        item = self._get().json()['resultados'][0]

        self.assertEqual(item['id'], insp.id)
        self.assertEqual(item['nombre'], 'Dique')
        self.assertEqual(item['severidad_max'], 'high')
        self.assertEqual(item['total_fotos'], 2)
        self.assertEqual(item['buque_nombre'], 'ARC Caribe')

    def test_inspeccion_sin_fotos_tiene_total_cero(self):
        _crear(self.caribe)

        self.assertEqual(self._get().json()['resultados'][0]['total_fotos'], 0)

    def test_orden_mas_reciente_primero(self):
        a = _crear(self.caribe, fecha=datetime(2026, 1, 1, 10))
        b = _crear(self.caribe, fecha=datetime(2026, 3, 1, 10))
        c = _crear(self.caribe, fecha=datetime(2026, 2, 1, 10))

        self.assertEqual(self._ids(), [b.id, c.id, a.id])


class FiltrosTests(BusquedaBase):
    def test_buque(self):
        a = _crear(self.caribe)
        _crear(self.gorgona)

        self.assertEqual(self._ids(buque=self.caribe.id), [a.id])

    def test_buque_id_sigue_funcionando_como_alias(self):
        a = _crear(self.caribe)
        _crear(self.gorgona)

        self.assertEqual(self._ids(buque_id=self.caribe.id), [a.id])

    def test_desde_es_inclusivo(self):
        _crear(self.caribe, fecha=datetime(2026, 1, 9, 23, 59))
        a = _crear(self.caribe, fecha=datetime(2026, 1, 10, 0, 0))
        b = _crear(self.caribe, fecha=datetime(2026, 1, 20, 8))

        self.assertEqual(self._ids(desde='2026-01-10'), [b.id, a.id])

    def test_hasta_incluye_el_dia_completo(self):
        a = _crear(self.caribe, fecha=datetime(2026, 1, 10, 0, 0))
        b = _crear(self.caribe, fecha=datetime(2026, 1, 10, 23, 59, 59))
        _crear(self.caribe, fecha=datetime(2026, 1, 11, 0, 0))

        self.assertEqual(self._ids(hasta='2026-01-10'), [b.id, a.id])

    def test_rango_de_un_solo_dia(self):
        _crear(self.caribe, fecha=datetime(2026, 1, 9, 12))
        a = _crear(self.caribe, fecha=datetime(2026, 1, 10, 12))
        _crear(self.caribe, fecha=datetime(2026, 1, 11, 12))

        self.assertEqual(self._ids(desde='2026-01-10', hasta='2026-01-10'), [a.id])

    def test_severidad_min(self):
        _crear(self.caribe)  # sin severidad
        _crear(self.caribe, severidad=1)
        m = _crear(self.caribe, severidad=2)
        h = _crear(self.caribe, severidad=3)
        c = _crear(self.caribe, severidad=4)

        self.assertEqual(self._ids(severidad_min='medium'), [c.id, h.id, m.id])
        self.assertEqual(self._ids(severidad_min='CRITICAL'), [c.id])

    def test_q_busca_en_el_nombre_sin_distinguir_mayusculas(self):
        a = _crear(self.caribe, nombre='Dique seco 2026')
        _crear(self.caribe, nombre='Revisión de hélices')

        self.assertEqual(self._ids(q='  DIQUE '), [a.id])

    def test_q_trata_porcentaje_y_guion_bajo_como_texto_literal(self):
        a = _crear(self.caribe, nombre='avance 50% listo')
        _crear(self.caribe, nombre='avance 500 listo')

        self.assertEqual(self._ids(q='50%'), [a.id])

    def test_combinacion_de_filtros(self):
        buscada = _crear(self.caribe, nombre='Dique seco', fecha=datetime(2026, 2, 10, 9), severidad=4)
        _crear(self.gorgona, nombre='Dique seco', fecha=datetime(2026, 2, 10, 9), severidad=4)
        _crear(self.caribe, nombre='Dique seco', fecha=datetime(2025, 2, 10, 9), severidad=4)
        _crear(self.caribe, nombre='Dique seco', fecha=datetime(2026, 2, 10, 9), severidad=2)
        _crear(self.caribe, nombre='Otra', fecha=datetime(2026, 2, 10, 9), severidad=4)

        ids = self._ids(
            buque=self.caribe.id, desde='2026-01-01', hasta='2026-12-31',
            severidad_min='high', q='dique',
        )

        self.assertEqual(ids, [buscada.id])

    def test_parametros_desconocidos_se_ignoran(self):
        a = _crear(self.caribe)

        self.assertEqual(self._ids(color='rojo', page=3), [a.id])

    def test_parametros_vacios_se_validan_como_cualquier_otro(self):
        res = self._get(q='')

        self.assertEqual(res.status_code, 400)
        self.assertIn('q', res.json()['campos'])


class ParametrosInvalidosTests(BusquedaBase):
    def _campos(self, **params):
        res = self._get(**params)
        self.assertEqual(res.status_code, 400, res.content)
        self.assertEqual(res.json()['error'], 'Datos inválidos.')
        return res.json()['campos']

    def test_buque(self):
        for valor in ['abc', '0', '-1', '1.5', '', '9' * 30]:
            with self.subTest(valor=valor):
                self.assertIn('buque', self._campos(buque=valor))

    def test_buque_id_alias_reporta_su_propio_nombre(self):
        self.assertIn('buque_id', self._campos(buque_id='xyz'))

    def test_fechas(self):
        for valor in ['2026-13-01', '2026-02-30', '20260101', '2026-1-1', 'ayer', '2026-W01-1']:
            with self.subTest(valor=valor):
                self.assertIn('desde', self._campos(desde=valor))
                self.assertIn('hasta', self._campos(hasta=valor))

    def test_desde_posterior_a_hasta(self):
        campos = self._campos(desde='2026-02-01', hasta='2026-01-01')

        self.assertIn('desde', campos)

    def test_severidad_min(self):
        self.assertIn('severidad_min', self._campos(severidad_min='extreme'))
        self.assertIn('severidad_min', self._campos(severidad_min='3'))

    def test_q_demasiado_corto_o_largo(self):
        self.assertIn('q', self._campos(q='a'))
        self.assertIn('q', self._campos(q='  a  '))
        self.assertIn('q', self._campos(q='x' * 101))

    def test_q_en_los_limites_es_valido(self):
        self.assertEqual(self._get(q='ab').status_code, 200)
        self.assertEqual(self._get(q='x' * 100).status_code, 200)

    def test_limit(self):
        for valor in ['0', '101', '-5', 'abc', '2.5', '9' * 5000]:
            with self.subTest(valor=valor):
                self.assertIn('limit', self._campos(limit=valor))

    def test_cursor(self):
        for valor in ['!!!', 'abc', 'x' * 500, codificar_cursor(datetime(2026, 1, 1), 1)[:-3]]:
            with self.subTest(valor=valor):
                self.assertIn('cursor', self._campos(cursor=valor))

    def test_cursor_con_fecha_aware_es_invalido_sin_use_tz(self):
        crudo = base64.urlsafe_b64encode(b'2026-01-01T00:00:00+00:00|5').decode()

        self.assertIn('cursor', self._campos(cursor=crudo))

    def test_cursor_con_id_fuera_de_rango_es_invalido(self):
        crudo = base64.urlsafe_b64encode(f'2026-01-01T00:00:00|{2**70}'.encode()).decode()

        self.assertIn('cursor', self._campos(cursor=crudo))

    def test_errores_de_varios_campos_se_devuelven_juntos(self):
        campos = self._campos(buque='x', desde='nope', limit='0', severidad_min='z')

        self.assertEqual(set(campos), {'buque', 'desde', 'limit', 'severidad_min'})


class PaginacionTests(BusquedaBase):
    def _recorrer(self, limit, **filtros):
        """Walk every page; returns the flat id list and the number of pages."""
        ids, cursor, paginas = [], None, 0
        while True:
            params = {'limit': limit, **filtros}
            if cursor:
                params['cursor'] = cursor
            body = self._get(**params).json()
            paginas += 1
            ids.extend(r['id'] for r in body['resultados'])
            if not body['hay_mas']:
                self.assertIsNone(body['siguiente'])
                return ids, paginas
            self.assertIsNotNone(body['siguiente'])
            cursor = body['siguiente']
            self.assertLess(paginas, 100, 'el cursor no avanza')

    def test_recorre_todas_las_paginas_sin_duplicados_ni_faltantes(self):
        creadas = [
            _crear(self.caribe, fecha=datetime(2026, 1, 1 + i, 8)) for i in range(7)
        ]
        esperado = [i.id for i in sorted(creadas, key=lambda i: i.fecha_creacion, reverse=True)]

        ids, paginas = self._recorrer(limit=3)

        self.assertEqual(ids, esperado)
        self.assertEqual(paginas, 3)

    def test_marcas_de_tiempo_iguales_se_desempatan_por_id(self):
        misma = datetime(2026, 5, 5, 12, 0, 0, 123456)
        creadas = [_crear(self.caribe, fecha=misma) for _ in range(7)]
        # An older and a newer one around the tie.
        mas_vieja = _crear(self.caribe, fecha=datetime(2026, 5, 4))
        mas_nueva = _crear(self.caribe, fecha=datetime(2026, 5, 6))
        esperado = (
            [mas_nueva.id]
            + sorted((i.id for i in creadas), reverse=True)
            + [mas_vieja.id]
        )

        for limit in (1, 2, 3, 4):
            with self.subTest(limit=limit):
                ids, _ = self._recorrer(limit=limit)
                self.assertEqual(ids, esperado)

    def test_hay_mas_es_falso_cuando_la_ultima_pagina_queda_exacta(self):
        for i in range(4):
            _crear(self.caribe, fecha=datetime(2026, 1, 1 + i))

        primera = self._get(limit=2).json()
        segunda = self._get(limit=2, cursor=primera['siguiente']).json()

        self.assertTrue(primera['hay_mas'])
        self.assertEqual(len(segunda['resultados']), 2)
        self.assertFalse(segunda['hay_mas'])
        self.assertIsNone(segunda['siguiente'])

    def test_limit_por_defecto_es_20(self):
        for i in range(21):
            _crear(self.caribe, fecha=datetime(2026, 1, 1, 0, i))

        body = self._get().json()

        self.assertEqual(len(body['resultados']), 20)
        self.assertTrue(body['hay_mas'])

    def test_limit_maximo_100(self):
        self.assertEqual(self._get(limit=100).status_code, 200)

    def test_cursor_se_combina_con_filtros(self):
        propias = [
            _crear(self.caribe, fecha=datetime(2026, 1, 1 + i)) for i in range(5)
        ]
        for i in range(5):
            _crear(self.gorgona, fecha=datetime(2026, 1, 1 + i, 12))

        ids, _ = self._recorrer(limit=2, buque=self.caribe.id)

        self.assertEqual(ids, [i.id for i in reversed(propias)])

    def test_inserciones_nuevas_no_alteran_las_paginas_siguientes(self):
        for i in range(4):
            _crear(self.caribe, fecha=datetime(2026, 1, 1 + i))
        primera = self._get(limit=2).json()
        _crear(self.caribe, fecha=datetime(2026, 6, 1))  # newer than everything

        segunda = self._get(limit=2, cursor=primera['siguiente']).json()

        vistos = {r['id'] for r in primera['resultados']}
        self.assertFalse(vistos & {r['id'] for r in segunda['resultados']})
        self.assertEqual(len(segunda['resultados']), 2)


class BuscarInspeccionesFuncionTests(BusquedaBase):
    def test_devuelve_tupla_y_lanza_con_errores_por_campo(self):
        _crear(self.caribe)

        pagina, siguiente, hay_mas = buscar_inspecciones({'limit': '5'})

        self.assertEqual(len(pagina), 1)
        self.assertIsNone(siguiente)
        self.assertFalse(hay_mas)
        with self.assertRaises(BusquedaInvalida) as ctx:
            buscar_inspecciones({'buque': 'x', 'limit': '0'})
        self.assertEqual(set(ctx.exception.errores), {'buque', 'limit'})


class DescribirFiltrosTests(TestCase):
    def test_es_serializable_y_cubre_el_registro(self):
        descripcion = describir_filtros()

        self.assertEqual(json.loads(json.dumps(descripcion)), descripcion)
        self.assertEqual(
            [f['nombre'] for f in descripcion['filtros']], list(FILTROS),
        )

    def test_forma_de_cada_filtro(self):
        por_nombre = {f['nombre']: f for f in describir_filtros()['filtros']}

        self.assertEqual(set(por_nombre), {'buque', 'desde', 'hasta', 'severidad_min', 'q'})
        for filtro in por_nombre.values():
            self.assertEqual(
                set(filtro), {'nombre', 'tipo', 'descripcion', 'valores', 'formato', 'alias'},
            )
        self.assertEqual(por_nombre['severidad_min']['tipo'], 'enum')
        self.assertEqual(
            por_nombre['severidad_min']['valores'], ['low', 'medium', 'high', 'critical'],
        )
        self.assertEqual(por_nombre['desde']['formato'], 'YYYY-MM-DD')
        self.assertEqual(por_nombre['buque']['alias'], ['buque_id'])
        self.assertIsNone(por_nombre['q']['valores'])

    def test_describe_paginacion_y_orden(self):
        descripcion = describir_filtros()

        self.assertEqual(descripcion['paginacion']['limit']['maximo'], 100)
        self.assertEqual(descripcion['orden'], ['-fecha_creacion', '-id'])
