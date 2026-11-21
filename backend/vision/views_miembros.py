"""
Members of an inspection: the leader invites users by email or user id, gives them a role
(Colaborador, Revisor, Observador) or adjusted permissions, and removes them.
Everyone who can read the inspection can see who its members are.
"""
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view
from rest_framework.response import Response

from cuentas.models import referencia_publica

from .models import InspeccionCasco, InspeccionMiembro
from .permisos import LIDER, exigir

_ROLES_PLANTILLA = {r.value for r in InspeccionMiembro.ROLES}
MAX_INVITADOS_AL_CREAR = 50


def _miembro_to_dict(miembro):
    usuario = miembro.usuario
    return {
        'id': miembro.id,
        'usuario': {**referencia_publica(usuario), 'cargo': usuario.cargo},
        'rol': miembro.rol,
        'permisos': miembro.permisos(),
        'fecha_agregado': miembro.fecha_agregado.isoformat(),
    }


def _validar_permisos(data, base):
    """
    Resolve the member's permissions from ``rol`` (a template) plus optional
    ``permisos`` overrides. ``base`` is the current set (edits) or None (invitation).
    Returns (permisos|None, errores).
    """
    errores = {}
    permisos = dict(base) if base else None
    if 'rol' in data or base is None:
        rol = data.get('rol')
        if rol not in _ROLES_PLANTILLA:
            errores['rol'] = [f"Debe ser uno de: {', '.join(sorted(_ROLES_PLANTILLA))}."]
        else:
            permisos = dict(InspeccionMiembro.ROLES[rol])
    if 'permisos' in data:
        ajustes = data['permisos']
        if not isinstance(ajustes, dict):
            errores['permisos'] = ['Debe ser un objeto.']
        else:
            desconocidos = sorted(set(ajustes) - set(InspeccionMiembro.PERMISOS))
            no_bool = sorted(k for k, v in ajustes.items() if k in InspeccionMiembro.PERMISOS and not isinstance(v, bool))
            if desconocidos:
                errores['permisos'] = [f"Permisos desconocidos: {', '.join(desconocidos)}."]
            elif no_bool:
                errores['permisos'] = [f"Deben ser true o false: {', '.join(no_bool)}."]
            elif permisos is not None:
                permisos.update(ajustes)
    return permisos, errores


def _usuario_invitado(data):
    """
    Resolve who is invited: by ``email`` (typed by hand) or by ``usuario_id`` (picked from the
    user search), exactly one of them. Returns (usuario|None, campo, mensaje|None), where
    ``campo`` is the field any error belongs to.
    """
    Usuario = get_user_model()
    if 'usuario_id' in data:
        if 'email' in data:
            return None, 'usuario_id', 'Envía email o usuario_id, no ambos.'
        usuario_id = data.get('usuario_id')
        # bool is an int subclass: True must not invite user #1.
        if not isinstance(usuario_id, int) or isinstance(usuario_id, bool):
            return None, 'usuario_id', 'Debe ser un número entero.'
        usuario = Usuario.objects.filter(pk=usuario_id, is_active=True).first()
        return usuario, 'usuario_id', None if usuario else 'No hay ninguna cuenta activa con este id.'
    email = data.get('email')
    if not isinstance(email, str) or not email.strip():
        return None, 'email', 'Este campo es requerido.'
    usuario = Usuario.objects.filter(email=email.strip().lower(), is_active=True).first()
    return usuario, 'email', None if usuario else 'No hay ninguna cuenta activa con este email.'


def validar_invitacion(data, lider_id, ya_es_miembro):
    """
    Validate one invitation ``{email | usuario_id, rol, permisos?}`` for an inspection led by ``lider_id``.
    ``ya_es_miembro(usuario)`` says whether that user is already a member (or earlier in the same list).
    Returns (usuario|None, permisos|None, errores) with errores keyed by field.
    """
    if not hasattr(data, 'get'):
        return None, None, {'email': ['Cada invitado debe ser un objeto {email | usuario_id, rol}.']}
    permisos, errores = _validar_permisos(data, base=None)
    usuario, campo, mensaje = _usuario_invitado(data)
    if mensaje is None:
        if usuario.pk == lider_id:
            mensaje = 'Es el líder de la inspección.'
        elif ya_es_miembro(usuario):
            mensaje = 'Ya es miembro de la inspección.'
    if mensaje:
        errores[campo] = [mensaje]
    return usuario, permisos, errores


def validar_equipo(valor, lider_id):
    """
    Validate the ``miembros`` list sent when creating an inspection.
    Returns (``[(usuario, permisos), ...]``, errores) with flat keys ``miembros.<i>.<campo>``
    (or ``miembros`` when the value is not a list), so the client can place each message.
    """
    if not isinstance(valor, list):
        return [], {'miembros': ['Debe ser una lista de {email | usuario_id, rol}.']}
    # Bounded before any lookup: each entry queries an account, so an unbounded list
    # would let one request probe many emails.
    if len(valor) > MAX_INVITADOS_AL_CREAR:
        return [], {'miembros': [f'Máximo {MAX_INVITADOS_AL_CREAR} personas por inspección al crearla.']}
    equipo, errores, vistos = [], {}, set()
    for posicion, item in enumerate(valor):
        usuario, permisos, errores_item = validar_invitacion(item, lider_id, lambda u: u.pk in vistos)
        for campo, mensajes in errores_item.items():
            errores[f'miembros.{posicion}.{campo}'] = mensajes
        if usuario is not None:
            vistos.add(usuario.pk)
        if not errores_item:
            equipo.append((usuario, permisos))
    return equipo, errores


def crear_miembros(inspeccion, equipo, agregado_por):
    """Insert the validated ``(usuario, permisos)`` pairs as members of ``inspeccion``."""
    for usuario, permisos in equipo:
        miembro = InspeccionMiembro(inspeccion=inspeccion, usuario=usuario, agregado_por=agregado_por)
        miembro.asignar(permisos)
        miembro.save()


@extend_schema(
    methods=['GET'], tags=['Visión IA'], summary='Miembros de una inspección',
    description='Usuarios invitados por el líder, con su `rol` y sus `permisos`.',
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
)
@extend_schema(
    methods=['POST'], tags=['Visión IA'], summary='Invitar a un miembro',
    description=(
        'Solo el líder. `{email | usuario_id, rol, permisos?}`: se invita por email o por el `id` que devuelve '
        '`GET /api/auth/usuarios/` (uno de los dos); `rol` es `colaborador` (todos los permisos), `revisor` '
        '(editar el reporte) u `observador` (solo leer); `permisos` ajusta `subir_fotos`, `analizar`, '
        '`editar_reporte`, `editar_inspeccion` y deja el rol como `personalizado` si ya no coincide.'
    ),
    request={'application/json': {
        'type': 'object', 'required': ['rol'],
        'description': 'Exactamente uno de `email` o `usuario_id`; ninguno o ambos responden 400.',
        'properties': {'email': {'type': 'string'}, 'usuario_id': {'type': 'integer'}, 'rol': {'type': 'string'},
                       'permisos': {'type': 'object'}},
    }},
    responses={201: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 403: OpenApiTypes.OBJECT},
)
@api_view(['GET', 'POST'])
def api_vision_miembros(request, inspeccion_id):
    inspeccion = get_object_or_404(InspeccionCasco, pk=inspeccion_id)
    if request.method == 'GET':
        exigir(request.user, inspeccion)
        miembros = inspeccion.miembros.select_related('usuario')
        return Response([_miembro_to_dict(m) for m in miembros])

    exigir(request.user, inspeccion, LIDER)
    data = request.data if hasattr(request.data, 'get') else {}
    usuario, permisos, errores = validar_invitacion(
        data, inspeccion.lider_id, lambda u: inspeccion.miembros.filter(usuario=u).exists(),
    )
    if errores:
        return Response({'error': 'Datos inválidos.', 'campos': errores}, status=400)

    miembro = InspeccionMiembro(inspeccion=inspeccion, usuario=usuario, agregado_por=request.user)
    miembro.asignar(permisos)
    try:
        with transaction.atomic():
            miembro.save()
    except IntegrityError:
        # Query only after the failed savepoint has been rolled back.
        if not inspeccion.miembros.filter(usuario=usuario).exists():
            raise
        campo = 'usuario_id' if 'usuario_id' in data else 'email'
        return Response({'error': 'Datos inválidos.', 'campos': {
            campo: ['Ya es miembro de la inspección.'],
        }}, status=400)
    return Response(_miembro_to_dict(miembro), status=201)


@extend_schema(
    methods=['PATCH'], tags=['Visión IA'], summary='Cambiar el rol o los permisos de un miembro',
    description='Solo el líder. `{rol?, permisos?}`, con las mismas reglas que al invitar.',
    request={'application/json': {'type': 'object'}},
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 403: OpenApiTypes.OBJECT},
)
@extend_schema(methods=['DELETE'], tags=['Visión IA'], summary='Quitar un miembro',
               description='Solo el líder.', responses={204: None, 403: OpenApiTypes.OBJECT})
@api_view(['PATCH', 'DELETE'])
def api_vision_miembro_detalle(request, inspeccion_id, miembro_id):
    inspeccion = get_object_or_404(InspeccionCasco, pk=inspeccion_id)
    exigir(request.user, inspeccion, LIDER)
    miembro = get_object_or_404(InspeccionMiembro.objects.select_related('usuario'),
                                pk=miembro_id, inspeccion=inspeccion)
    if request.method == 'DELETE':
        miembro.delete()
        return Response(status=204)

    data = request.data if hasattr(request.data, 'get') else {}
    desconocidos = sorted(set(data) - {'rol', 'permisos'})
    permisos, errores = _validar_permisos(data, base=miembro.permisos())
    if desconocidos:
        errores['campos'] = [f"Campos desconocidos: {', '.join(desconocidos)}."]
    if errores:
        return Response({'error': 'Datos inválidos.', 'campos': errores}, status=400)
    miembro.asignar(permisos)
    miembro.save()
    return Response(_miembro_to_dict(miembro))
