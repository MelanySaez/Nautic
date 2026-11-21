"""User search behind the invitation autocomplete: by name only, never exposing emails."""
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

Usuario = get_user_model()

URL = '/api/auth/usuarios/'


class BusquedaUsuariosTests(TestCase):
    def setUp(self):
        cache.clear()  # throttling counters
        self.yo = Usuario.objects.create_user('ana@ejemplo.com', 'x', nombre='Ana Martín', cargo='Inspectora')
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.yo)

    def _buscar(self, q, cliente=None):
        return (cliente or self.cliente).get(URL, {'q': q})

    def test_exige_sesion(self):
        self.assertEqual(APIClient().get(URL, {'q': 'ma'}).status_code, 401)

    def test_valida_el_texto(self):
        for params in ({}, {'q': ''}, {'q': ' m '}, {'q': 'x' * 101}):
            res = self.cliente.get(URL, params)
            self.assertEqual(res.status_code, 400, params)
            self.assertEqual(list(res.json()['campos']), ['q'], params)

    def test_busca_por_nombre_sin_distinguir_mayusculas_y_sin_email(self):
        marta = Usuario.objects.create_user('marta@ejemplo.com', 'x', nombre='Marta Ruiz', cargo='Jefa de dique')
        Usuario.objects.create_user('pedro@ejemplo.com', 'x', nombre='Pedro Gil')

        res = self._buscar('  MAR ')

        self.assertEqual(res.status_code, 200)
        # The requester (Ana Martín) is never suggested to themself.
        self.assertEqual(res.json(), {'resultados': [{'id': marta.id, 'nombre': 'Marta Ruiz', 'cargo': 'Jefa de dique'}]})

    def test_no_busca_por_email(self):
        Usuario.objects.create_user('marta@ejemplo.com', 'x', nombre='Marta Ruiz')

        for q in ('marta@', 'ejemplo.com', 'marta@ejemplo.com'):
            self.assertEqual(self._buscar(q).json(), {'resultados': []}, q)

    def test_excluye_cuentas_inactivas(self):
        Usuario.objects.create_user('mario@ejemplo.com', 'x', nombre='Mario', is_active=False)

        self.assertEqual(self._buscar('mario').json(), {'resultados': []})

    def test_ordena_por_nombre_y_devuelve_como_mucho_ocho(self):
        for i in range(10):
            Usuario.objects.create_user(f'p{i}@ejemplo.com', 'x', nombre=f'Persona {9 - i}')

        nombres = [r['nombre'] for r in self._buscar('persona').json()['resultados']]

        self.assertEqual(nombres, [f'Persona {i}' for i in range(8)])

    @override_settings(REST_FRAMEWORK={
        'DEFAULT_AUTHENTICATION_CLASSES': ['cuentas.autenticacion.Sesion'],
        'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
        'DEFAULT_THROTTLE_RATES': {'cuentas': '10/min', 'busqueda_usuarios': '2/min'},
    })
    def test_limita_las_busquedas_por_usuario(self):
        otro = Usuario.objects.create_user('otro@ejemplo.com', 'x', nombre='Otro')
        cliente_otro = APIClient()
        cliente_otro.force_authenticate(otro)

        self.assertEqual(self._buscar('ma').status_code, 200)
        self.assertEqual(self._buscar('ma').status_code, 200)
        self.assertEqual(self._buscar('ma').status_code, 429)
        # The limit is per user, not shared by everyone behind the same address.
        self.assertEqual(self._buscar('ma', cliente_otro).status_code, 200)
