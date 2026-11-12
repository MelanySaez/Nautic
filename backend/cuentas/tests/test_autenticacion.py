"""User accounts and session login (cookie + CSRF)."""
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

Usuario = get_user_model()

URL_CSRF = '/api/auth/csrf/'
URL_LOGIN = '/api/auth/login/'
URL_LOGOUT = '/api/auth/logout/'
URL_YO = '/api/auth/yo/'
URL_REGISTRO = '/api/auth/registro/'


class UsuarioTests(TestCase):
    def test_el_modelo_activo_es_el_propio(self):
        self.assertEqual(Usuario._meta.label, 'cuentas.Usuario')
        self.assertEqual(Usuario.USERNAME_FIELD, 'email')

    def test_crea_usuario_con_email_normalizado_y_clave_cifrada(self):
        usuario = Usuario.objects.create_user('Ana@Ejemplo.COM', 'secreta-123', nombre='Ana Gómez', cargo='Inspectora')

        self.assertEqual(usuario.email, 'ana@ejemplo.com')
        self.assertNotEqual(usuario.password, 'secreta-123')
        self.assertTrue(usuario.check_password('secreta-123'))
        self.assertTrue(usuario.is_active)
        self.assertFalse(usuario.is_staff)
        self.assertEqual(str(usuario), 'Ana Gómez')

    def test_el_email_es_obligatorio_y_unico(self):
        with self.assertRaises(ValueError):
            Usuario.objects.create_user('', 'x')
        Usuario.objects.create_user('ana@ejemplo.com', 'x')
        with self.assertRaises(Exception):
            Usuario.objects.create_user('ana@ejemplo.com', 'y')

    def test_superusuario(self):
        admin = Usuario.objects.create_superuser('admin@ejemplo.com', 'x')

        self.assertTrue(admin.is_staff and admin.is_superuser)


class SesionTests(TestCase):
    def setUp(self):
        cache.clear()  # login is throttled per IP
        self.usuario = Usuario.objects.create_user(
            'ana@ejemplo.com', 'secreta-123', nombre='Ana Gómez', cargo='Inspectora',
        )
        self.cliente = APIClient(enforce_csrf_checks=True)

    def _csrf(self):
        respuesta = self.cliente.get(URL_CSRF)
        self.assertEqual(respuesta.status_code, 204)
        return self.cliente.cookies['csrftoken'].value

    def _login(self, email='ana@ejemplo.com', password='secreta-123'):
        return self.cliente.post(
            URL_LOGIN, {'email': email, 'password': password}, format='json', HTTP_X_CSRFTOKEN=self._csrf(),
        )

    def test_login_abre_la_sesion_y_devuelve_el_usuario(self):
        respuesta = self._login(email='ANA@ejemplo.com')

        self.assertEqual(respuesta.status_code, 200)
        esperado = {'id': self.usuario.id, 'email': 'ana@ejemplo.com', 'nombre': 'Ana Gómez',
                    'cargo': 'Inspectora', 'es_admin': False}
        self.assertEqual(respuesta.json(), esperado)
        self.assertEqual(self.cliente.get(URL_YO).json(), esperado)

    def test_credenciales_incorrectas_dan_el_mismo_mensaje(self):
        self.usuario_inactivo = Usuario.objects.create_user('ina@ejemplo.com', 'secreta-123', is_active=False)
        for email, password in (('ana@ejemplo.com', 'mala'), ('nadie@ejemplo.com', 'secreta-123'),
                                ('ina@ejemplo.com', 'secreta-123')):
            respuesta = self._login(email, password)
            self.assertEqual(respuesta.status_code, 400, email)
            self.assertEqual(respuesta.json(), {'error': 'Email o contraseña incorrectos.'})
        self.assertEqual(self.cliente.get(URL_YO).status_code, 401)

    def test_datos_faltantes(self):
        respuesta = self.cliente.post(URL_LOGIN, {'email': ''}, format='json', HTTP_X_CSRFTOKEN=self._csrf())

        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(set(respuesta.json()['campos']), {'email', 'password'})

    def test_login_exige_el_token_csrf(self):
        self._csrf()
        respuesta = self.cliente.post(URL_LOGIN, {'email': 'ana@ejemplo.com', 'password': 'secreta-123'}, format='json')

        self.assertEqual(respuesta.status_code, 403)
        self.assertEqual(self.cliente.get(URL_YO).status_code, 401)

    def test_sin_sesion_yo_responde_401(self):
        self.assertEqual(self.cliente.get(URL_YO).status_code, 401)

    def test_logout_cierra_la_sesion(self):
        self._login()

        respuesta = self.cliente.post(URL_LOGOUT, HTTP_X_CSRFTOKEN=self.cliente.cookies['csrftoken'].value)

        self.assertEqual(respuesta.status_code, 204)
        self.assertEqual(self.cliente.get(URL_YO).status_code, 401)


class RegistroTests(TestCase):
    def setUp(self):
        cache.clear()  # throttling counters
        self.cliente = APIClient(enforce_csrf_checks=True)

    def _registrar(self, **datos):
        self.cliente.get(URL_CSRF)
        cuerpo = {'email': 'luis@ejemplo.com', 'password': 'Casco-firme-2026', 'nombre': 'Luis Pérez', **datos}
        return self.cliente.post(URL_REGISTRO, cuerpo, format='json',
                                 HTTP_X_CSRFTOKEN=self.cliente.cookies['csrftoken'].value)

    def test_crea_la_cuenta_y_abre_la_sesion(self):
        respuesta = self._registrar(email='  Luis@Ejemplo.com ', cargo='Buzo')

        self.assertEqual(respuesta.status_code, 201)
        usuario = Usuario.objects.get()
        self.assertEqual((usuario.email, usuario.nombre, usuario.cargo), ('luis@ejemplo.com', 'Luis Pérez', 'Buzo'))
        self.assertTrue(usuario.check_password('Casco-firme-2026'))
        self.assertFalse(usuario.is_staff or usuario.is_superuser)
        self.assertEqual(respuesta.json()['email'], 'luis@ejemplo.com')
        self.assertEqual(self.cliente.get(URL_YO).json()['id'], usuario.id)

    def test_datos_invalidos_no_crean_nada(self):
        Usuario.objects.create_user('ana@ejemplo.com', 'x')

        respuesta = self._registrar(email='ANA@ejemplo.com', password='123', nombre='  ')

        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(set(respuesta.json()['campos']), {'email', 'password', 'nombre'})
        respuesta = self._registrar(email='no-es-un-email')
        self.assertIn('email', respuesta.json()['campos'])
        self.assertEqual(Usuario.objects.count(), 1)

    def test_no_permite_elegir_privilegios(self):
        self._registrar(is_staff=True, is_superuser=True)

        usuario = Usuario.objects.get()
        self.assertFalse(usuario.is_staff or usuario.is_superuser)

    def test_exige_el_token_csrf(self):
        self.cliente.get(URL_CSRF)
        respuesta = self.cliente.post(URL_REGISTRO, {'email': 'a@b.com', 'password': 'Casco-firme-2026',
                                                     'nombre': 'A'}, format='json')

        self.assertEqual(respuesta.status_code, 403)
        self.assertFalse(Usuario.objects.exists())

    @override_settings(REST_FRAMEWORK={
        'DEFAULT_AUTHENTICATION_CLASSES': ['cuentas.autenticacion.Sesion'],
        'DEFAULT_THROTTLE_RATES': {'cuentas': '3/min'},
    })
    def test_limita_los_intentos_por_ip(self):
        for intento in range(3):
            self.assertEqual(self._registrar(password='1').status_code, 400, intento)

        self.assertEqual(self._registrar(password='1').status_code, 429)

    @override_settings(REST_FRAMEWORK={
        'DEFAULT_AUTHENTICATION_CLASSES': ['cuentas.autenticacion.Sesion'],
        'DEFAULT_THROTTLE_RATES': {'cuentas': '3/min'},
    })
    def test_cambiar_x_forwarded_for_no_esquiva_el_limite(self):
        codigos = []
        for i in range(5):
            self.cliente.get(URL_CSRF)
            codigos.append(self.cliente.post(
                URL_LOGIN, {'email': 'a@b.com', 'password': 'x'}, format='json',
                HTTP_X_CSRFTOKEN=self.cliente.cookies['csrftoken'].value, HTTP_X_FORWARDED_FOR=f'10.0.0.{i}',
            ).status_code)

        self.assertEqual(codigos, [400, 400, 400, 429, 429])

