"""
Members of an inspection: the leader invites users by email, gives them a role
(Colaborador, Revisor, Observador) or adjusted permissions, and removes them.
Everyone who can read the inspection can see who its members are.
"""
from django.contrib.auth import get_user_model
from django.db import transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view
from rest_framework.response import Response

from cuentas.models import referencia_publica

from .models import InspeccionCasco, InspeccionMiembro
from .permisos import LIDER, exigir

_ROLES_PLANTILLA = {r.value for r in InspeccionMiembro.ROLES}


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


@extend_schema(
    methods=['GET'], tags=['Visión IA'], summary='Miembros de una inspección',
    description='Usuarios invitados por el líder, con su `rol` y sus `permisos`.',
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
)
@extend_schema(
    methods=['POST'], tags=['Visión IA'], summary='Invitar a un miembro',
    description=(
        'Solo el líder. `{email, rol, permisos?}`: `rol` es `colaborador` (todos los permisos), `revisor` '
        '(editar el reporte) u `observador` (solo leer); `permisos` ajusta `subir_fotos`, `analizar`, '
        '`editar_reporte`, `editar_inspeccion` y deja el rol como `personalizado` si ya no coincide.'
    ),
    request={'application/json': {'type': 'object', 'required': ['email', 'rol']}},
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
    permisos, errores = _validar_permisos(data, base=None)
    email = data.get('email')
    usuario = None
    if not isinstance(email, str) or not email.strip():
        errores['email'] = ['Este campo es requerido.']
    else:
        usuario = get_user_model().objects.filter(email=email.strip().lower(), is_active=True).first()
        if usuario is None:
            errores['email'] = ['No hay ninguna cuenta activa con este email.']
        elif usuario.pk == inspeccion.lider_id:
            errores['email'] = ['Es el líder de la inspección.']
        elif inspeccion.miembros.filter(usuario=usuario).exists():
            errores['email'] = ['Ya es miembro de la inspección.']
    if errores:
        return Response({'error': 'Datos inválidos.', 'campos': errores}, status=400)

    miembro = InspeccionMiembro(inspeccion=inspeccion, usuario=usuario, agregado_por=request.user)
    miembro.asignar(permisos)
    with transaction.atomic():
        miembro.save()
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
