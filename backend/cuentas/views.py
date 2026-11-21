"""Session login for the SPA: CSRF cookie, login, logout and the current user."""
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.settings import api_settings
from rest_framework.throttling import SimpleRateThrottle

from .models import referencia_publica


class _LimiteCuentas(SimpleRateThrottle):
    """Per-IP limit for login and registration (scope ``cuentas``).

    Reads the rate at request time: DRF freezes ``THROTTLE_RATES`` at import,
    which would ignore ``override_settings`` and later settings changes.
    """
    scope = 'cuentas'

    def get_rate(self):
        return api_settings.DEFAULT_THROTTLE_RATES.get(self.scope)

    def allow_request(self, request, view):
        self.rate = self.get_rate()
        self.num_requests, self.duration = self.parse_rate(self.rate)
        return super().allow_request(request, view)

    def get_cache_key(self, request, view):
        # Forwarded addresses are trusted only with an explicit proxy count.
        # DRF trusts arbitrary X-Forwarded-For values when NUM_PROXIES is unset.
        ident = (self.get_ident(request) if api_settings.NUM_PROXIES is not None
                 else request.META.get('REMOTE_ADDR', ''))
        return self.cache_format % {'scope': self.scope, 'ident': ident}

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
@throttle_classes([_LimiteCuentas])
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


_NOMBRE_MAX = 255
_CARGO_MAX = 255


@extend_schema(
    tags=['Cuentas'], summary='Crear cuenta',
    description='Registro abierto: crea una cuenta sin privilegios y abre la sesión. Exige `X-CSRFToken`. '
                'Email duplicado o inválido, contraseña débil o nombre vacío responden 400 con `campos`; '
                'los campos desconocidos se ignoran. Limitado por IP junto con el login.',
    request={'application/json': {
        'type': 'object', 'required': ['email', 'password', 'nombre'],
        'properties': {'email': {'type': 'string'}, 'password': {'type': 'string'},
                       'nombre': {'type': 'string'}, 'cargo': {'type': 'string'}}}},
    responses={201: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 403: OpenApiTypes.OBJECT,
               429: OpenApiTypes.OBJECT},
)
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([_LimiteCuentas])
def api_auth_registro(request):
    SessionAuthentication().enforce_csrf(request)
    data = request.data if hasattr(request.data, 'get') else {}
    Usuario = get_user_model()

    def texto(campo):
        valor = data.get(campo, '')
        return valor.strip() if isinstance(valor, str) else None

    email, nombre, cargo = texto('email'), texto('nombre'), texto('cargo')
    password = data.get('password')
    campos = {}
    if not email:
        campos['email'] = ['Este campo es requerido.']
    elif len(email) > Usuario._meta.get_field('email').max_length:
        campos['email'] = [f'Máximo {Usuario._meta.get_field("email").max_length} caracteres.']
    else:
        email = email.lower()
        try:
            validate_email(email)
        except ValidationError:
            campos['email'] = ['Introduce un email válido.']
        else:
            if Usuario.objects.filter(email=email).exists():
                campos['email'] = ['Ya existe una cuenta con este email.']
    if not nombre:
        campos['nombre'] = ['Este campo es requerido.']
    elif len(nombre) > _NOMBRE_MAX:
        campos['nombre'] = [f'Máximo {_NOMBRE_MAX} caracteres.']
    if cargo is None or len(cargo) > _CARGO_MAX:
        campos['cargo'] = [f'Debe ser texto de máximo {_CARGO_MAX} caracteres.']
    if not isinstance(password, str) or not password:
        campos['password'] = ['Este campo es requerido.']
    else:
        try:
            validate_password(password, user=Usuario(email=email or '', nombre=nombre or ''))
        except ValidationError as exc:
            campos['password'] = list(exc.messages)
    if campos:
        return Response({'error': 'Datos inválidos.', 'campos': campos}, status=400)

    try:
        with transaction.atomic():
            # Only these fields: privileges can never come from the request.
            usuario = Usuario.objects.create_user(email, password, nombre=nombre, cargo=cargo)
    except IntegrityError:  # registered concurrently with the same email
        return Response({'error': 'Datos inválidos.',
                         'campos': {'email': ['Ya existe una cuenta con este email.']}}, status=400)
    login(request, usuario)
    return Response(usuario_to_dict(usuario), status=201)


@extend_schema(tags=['Cuentas'], summary='Cerrar sesión', request=None, responses={204: None})
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


class _LimiteBusquedaUsuarios(_LimiteCuentas):
    """Per-user limit for the user search (scope ``busqueda_usuarios``), so typing stays cheap to abuse-check."""
    scope = 'busqueda_usuarios'

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': request.user.pk}


BUSQUEDA_MIN = 2
BUSQUEDA_MAX = 100
MAX_SUGERENCIAS = 8


@extend_schema(
    tags=['Cuentas'], summary='Buscar usuarios para invitar',
    description=(
        f'Cuentas activas cuyo nombre contiene `q` ({BUSQUEDA_MIN}-{BUSQUEDA_MAX} caracteres, sin distinguir '
        f'mayúsculas), sin incluir a quien busca. Nunca busca ni devuelve el email. Ordenadas por nombre, '
        f'como mucho {MAX_SUGERENCIAS}. Limitado por usuario.'
    ),
    parameters=[OpenApiParameter('q', str, required=True)],
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 401: OpenApiTypes.OBJECT,
               429: OpenApiTypes.OBJECT},
)
@api_view(['GET'])
@throttle_classes([_LimiteBusquedaUsuarios])
def api_auth_usuarios(request):
    q = request.query_params.get('q', '').strip()
    if not BUSQUEDA_MIN <= len(q) <= BUSQUEDA_MAX:
        return Response({'error': 'Datos inválidos.', 'campos': {
            'q': [f'Debe tener entre {BUSQUEDA_MIN} y {BUSQUEDA_MAX} caracteres.'],
        }}, status=400)
    usuarios = (get_user_model().objects
                .filter(is_active=True, nombre__icontains=q)
                .exclude(pk=request.user.pk)
                .order_by('nombre', 'id')[:MAX_SUGERENCIAS])
    # Name and cargo only: other users' emails are private (see referencia_publica).
    return Response({'resultados': [{**referencia_publica(u), 'cargo': u.cargo} for u in usuarios]})
