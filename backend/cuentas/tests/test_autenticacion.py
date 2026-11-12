"""User accounts and session login (cookie + CSRF)."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

Usuario = get_user_model()

URL_CSRF = '/api/auth/csrf/'
URL_LOGIN = '/api/auth/login/'
URL_LOGOUT = '/api/auth/logout/'
URL_YO = '/api/auth/yo/'


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
