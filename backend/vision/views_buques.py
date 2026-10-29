import math

from django.core.exceptions import ValidationError
from django.db import models
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Buque

# Pagination bounds for the list endpoint.
_LIMIT_POR_DEFECTO = 50
_LIMIT_MAXIMO = 200

# Fields the client may never send.
_CAMPOS_SOLO_LECTURA = {'id', 'created_at', 'updated_at'}

# Fields that must be present and non-blank.
_CAMPOS_REQUERIDOS = ('nombre', 'tipo')

# JSON fields and the container type each one must hold.
_CAMPOS_JSON = {
    'rondas_config': dict,
    'contexto_operacional': dict,
    'documentos': list,
    'misiones': list,
    'grupos_constructivos': list,
}

_MSG_JSON = {
    dict: 'Debe ser un objeto JSON.',
    list: 'Debe ser una lista JSON.',
}

# Derived from the model so new columns are picked up automatically.
_MODELO_CAMPOS = {f.name: f for f in Buque._meta.concrete_fields}
_CAMPOS_ESCRITURA = [n for n in _MODELO_CAMPOS if n not in _CAMPOS_SOLO_LECTURA]

_CAMPOS_RESUMEN = ('id', 'nombre', 'tipo', 'etapa', 'imagen')


def _iso(valor):
    return valor.isoformat() if valor else None


def _buque_resumen(buque):
    data = {campo: getattr(buque, campo) for campo in _CAMPOS_RESUMEN}
    data['created_at'] = _iso(buque.created_at)
    data['updated_at'] = _iso(buque.updated_at)
    return data


def _buque_to_dict(buque):
    data = {'id': buque.id}
    for campo in _CAMPOS_ESCRITURA:
        data[campo] = getattr(buque, campo)
    data['created_at'] = _iso(buque.created_at)
    data['updated_at'] = _iso(buque.updated_at)
    return data


def _parse_param_entero(valor, defecto, minimo, maximo=None):
    """
    Parse an integer query parameter. Returns the int, or None when the
    value is invalid or out of range.
    """
    if valor is None:
        return defecto
    valor = valor.strip()
    if not (valor.isascii() and valor.isdigit()):
        return None
    numero = int(valor)
    if numero < minimo or (maximo is not None and numero > maximo):
        return None
    return numero


def _validar_valor(nombre, valor):
    """
    Type-check one incoming value against its model field.
    Returns (valor_limpio, mensaje_error|None).
    """
    campo = _MODELO_CAMPOS[nombre]

    if nombre in _CAMPOS_JSON:
        tipo = _CAMPOS_JSON[nombre]
        if not isinstance(valor, tipo):
            return None, _MSG_JSON[tipo]
        return valor, None

    if valor is None:
        if campo.null and nombre not in _CAMPOS_REQUERIDOS:
            return None, None
        return None, 'Este campo no puede ser nulo.'

    if isinstance(campo, (models.CharField, models.TextField)):
        if not isinstance(valor, str):
            return None, 'Debe ser texto.'
        if nombre in _CAMPOS_REQUERIDOS:
            valor = valor.strip()
            if not valor:
                return None, 'Este campo es requerido.'
        return valor, None

    if isinstance(campo, (models.IntegerField, models.FloatField)):
        # bool is a subclass of int: reject it explicitly.
        if isinstance(valor, bool) or not isinstance(valor, (int, float)):
            return None, 'Debe ser un número.'
        if isinstance(campo, models.IntegerField) and not isinstance(valor, int):
            if not (math.isfinite(valor) and float(valor).is_integer()):
                return None, 'Debe ser un número entero.'
            valor = int(valor)
        if isinstance(valor, float) and not math.isfinite(valor):
            return None, 'Debe ser un número finito.'
        if valor < 0:
            return None, 'No puede ser negativo.'
        return valor, None

    return valor, None


def _validar_buque(data):
    """
    Validate a creation payload.
    Returns (campos_limpios, errores) where errores maps field -> [messages].
    """
    errores = {}

    for clave in data:
        if clave not in _CAMPOS_ESCRITURA:
            errores[clave] = ['Campo desconocido o no editable.']

    limpios = {}
    for nombre in _CAMPOS_ESCRITURA:
        if nombre not in data:
            if nombre in _CAMPOS_REQUERIDOS:
                errores[nombre] = ['Este campo es requerido.']
            continue
        valor, error = _validar_valor(nombre, data[nombre])
        if error:
            errores[nombre] = [error]
        else:
            limpios[nombre] = valor

    # Model-level validation (max_length, blank, integer range, ...) only on
    # fields that passed the type checks, to avoid duplicate messages.
    instancia = Buque(**limpios)
    excluir = [n for n in _CAMPOS_ESCRITURA if n not in limpios and n in errores]
    try:
        instancia.full_clean(exclude=excluir)
    except ValidationError as exc:
        for campo, mensajes in exc.message_dict.items():
            errores.setdefault(campo, []).extend(mensajes)

    return instancia, errores


@extend_schema(
    methods=['GET'],
    tags=['Buques'],
    summary='Listar buques',
    description=(
        'Lista buques ordenados por nombre (y luego id) con paginación manual '
        'por `offset` y `limit`. Devuelve solo campos de resumen.'
    ),
    parameters=[
        OpenApiParameter('offset', int, OpenApiParameter.QUERY, required=False,
                         description='Posición inicial (>= 0, por defecto 0)'),
        OpenApiParameter('limit', int, OpenApiParameter.QUERY, required=False,
                         description=f'Cantidad de resultados (1-{_LIMIT_MAXIMO}, por defecto {_LIMIT_POR_DEFECTO})'),
    ],
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT},
)
@extend_schema(
    methods=['POST'],
    tags=['Buques'],
    summary='Crear buque',
    description=(
        'Crea un buque. `nombre` y `tipo` son requeridos; el resto de los campos '
        'de la ficha técnica es opcional. Los campos numéricos no admiten valores '
        'negativos. Los campos desconocidos se rechazan.'
    ),
    request={
        'application/json': {
            'type': 'object',
            'required': list(_CAMPOS_REQUERIDOS),
            'properties': {
                'nombre': {'type': 'string'},
                'tipo': {'type': 'string'},
                'descripcion': {'type': 'string'},
                'etapa': {'type': 'string'},
                'imagen': {'type': 'string', 'nullable': True},
                'autonomia_horas': {'type': 'integer', 'minimum': 0, 'nullable': True},
                'vida_diseno_anios': {'type': 'integer', 'minimum': 0, 'nullable': True},
                'horas_navegacion_anio': {'type': 'integer', 'minimum': 0, 'nullable': True},
                'autonomia_dias': {'type': 'integer', 'minimum': 0, 'nullable': True},
                'vel_maxima_nudos': {'type': 'number', 'minimum': 0, 'nullable': True},
                'alcance_nm_a_12kn': {'type': 'number', 'minimum': 0, 'nullable': True},
                'eslora_total_m': {'type': 'number', 'minimum': 0, 'nullable': True},
                'manga_moldeada_m': {'type': 'number', 'minimum': 0, 'nullable': True},
                'puntal_m': {'type': 'number', 'minimum': 0, 'nullable': True},
                'calado_diseno_m': {'type': 'number', 'minimum': 0, 'nullable': True},
                'desplazamiento_ton': {'type': 'number', 'minimum': 0, 'nullable': True},
                'combustible_diario_m3': {'type': 'number', 'minimum': 0, 'nullable': True},
                'combustible_diesel_m3': {'type': 'number', 'minimum': 0, 'nullable': True},
                'combustible_helicoptero_m3': {'type': 'number', 'minimum': 0, 'nullable': True},
                'gasolina_botes_m3': {'type': 'number', 'minimum': 0, 'nullable': True},
                'agua_potable_m3': {'type': 'number', 'minimum': 0, 'nullable': True},
                'aceite_lubricante_m3': {'type': 'number', 'minimum': 0, 'nullable': True},
                'aceite_hidraulico_m3': {'type': 'number', 'minimum': 0, 'nullable': True},
                'rondas_config': {'type': 'object'},
                'contexto_operacional': {'type': 'object'},
                'documentos': {'type': 'array', 'items': {}},
                'misiones': {'type': 'array', 'items': {}},
                'grupos_constructivos': {'type': 'array', 'items': {}},
            },
            'additionalProperties': False,
        }
    },
    responses={201: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT},
)
@api_view(['GET', 'POST'])
def api_buques(request):
    """
    GET  /api/buques/   → lista paginada (offset/limit) con campos de resumen
    POST /api/buques/   → crea un buque
    """
    if request.method == 'GET':
        offset = _parse_param_entero(request.query_params.get('offset'), 0, 0)
        limit = _parse_param_entero(
            request.query_params.get('limit'), _LIMIT_POR_DEFECTO, 1, _LIMIT_MAXIMO,
        )
        if offset is None or limit is None:
            return Response(
                {'error': f'offset debe ser un entero >= 0 y limit un entero entre 1 y {_LIMIT_MAXIMO}.'},
                status=400,
            )
        qs = Buque.objects.order_by('nombre', 'id')
        return Response({
            'total': qs.count(),
            'offset': offset,
            'limit': limit,
            'resultados': [_buque_resumen(b) for b in qs[offset:offset + limit]],
        })

    # POST: create
    data = request.data
    if not hasattr(data, 'keys'):
        return Response({'error': 'Se esperaba un objeto JSON.'}, status=400)

    buque, errores = _validar_buque(data)
    if errores:
        return Response({'error': 'Datos inválidos.', 'campos': errores}, status=400)

    buque.save()
    return Response(_buque_to_dict(buque), status=201)


@extend_schema(
    tags=['Buques'],
    summary='Detalle de un buque',
    description='Devuelve la ficha técnica completa del buque.',
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
)
@api_view(['GET'])
def api_buque_detalle(request, buque_id):
    """
    GET /api/buques/<id>/  → ficha técnica completa
    """
    buque = get_object_or_404(Buque, pk=buque_id)
    return Response(_buque_to_dict(buque))
