"""Session login for the SPA: CSRF cookie, login, logout and the current user."""
from django.contrib.auth import authenticate, login, logout
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

_CREDENCIALES_INVALIDAS = 'Email o contraseña incorrectos.'


def usuario_to_dict(usuario):
    return {
        'id': usuario.id,
        'email': usuario.email,
        'nombre': usuario.nombre,
        'cargo': usuario.cargo,
        'es_admin': usuario.is_superuser,
    }


@extend_schema(tags=['Cuentas'], summary='Cookie CSRF',
               description='Deja la cookie `csrftoken`; el cliente la reenvía como `X-CSRFToken` en POST/PATCH/DELETE.',
               responses={204: None})
@api_view(['GET'])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def api_auth_csrf(request):
    return Response(status=204)


@extend_schema(
    tags=['Cuentas'], summary='Iniciar sesión',
    description='Abre una sesión (cookie) con email y contraseña. Exige `X-CSRFToken`. '
                'Credenciales incorrectas, usuario inexistente o inactivo responden el mismo 400.',
    request={'application/json': {'type': 'object', 'required': ['email', 'password'],
                                  'properties': {'email': {'type': 'string'}, 'password': {'type': 'string'}}}},
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 403: OpenApiTypes.OBJECT},
)
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_auth_login(request):
    # DRF only checks CSRF for authenticated sessions; a login form must be protected too.
    SessionAuthentication().enforce_csrf(request)
    data = request.data if hasattr(request.data, 'get') else {}
    email, password = data.get('email'), data.get('password')
    campos = {}
    if not isinstance(email, str) or not email.strip():
        campos['email'] = ['Este campo es requerido.']
    if not isinstance(password, str) or not password:
        campos['password'] = ['Este campo es requerido.']
    if campos:
        return Response({'error': 'Datos inválidos.', 'campos': campos}, status=400)

    # Emails are stored lowercase (UsuarioManager), so match them the same way.
    usuario = authenticate(request, username=email.strip().lower(), password=password)
    if usuario is None:
        return Response({'error': _CREDENCIALES_INVALIDAS}, status=400)
    login(request, usuario)
    return Response(usuario_to_dict(usuario))


@extend_schema(tags=['Cuentas'], summary='Cerrar sesión', responses={204: None})
@api_view(['POST'])
@permission_classes([AllowAny])
def api_auth_logout(request):
    logout(request)
    return Response(status=204)


@extend_schema(tags=['Cuentas'], summary='Usuario actual',
               responses={200: OpenApiTypes.OBJECT, 401: OpenApiTypes.OBJECT})
@api_view(['GET'])
@permission_classes([AllowAny])
def api_auth_yo(request):
    if not request.user.is_authenticated:
        return Response({'error': 'No has iniciado sesión.'}, status=401)
    return Response(usuario_to_dict(request.user))
