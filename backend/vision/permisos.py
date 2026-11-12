"""
Who may read or change an inspection.

- Read: public inspections, by every signed-in user; private ones, by their
  leader and members. Superusers read and do everything (support).
- Change: the leader does everything; a member only what its permissions allow
  (``InspeccionMiembro.PERMISOS``). Leader-only actions: privacy, members,
  leadership transfer and deleting the inspection.

Unreadable inspections answer 404 (their existence is not revealed); readable
ones without the permission answer 403.
"""
from django.db.models import Q
from django.http import Http404
from rest_framework.exceptions import PermissionDenied

from .models import InspeccionMiembro

LIDER = 'lider'

_MENSAJES = {
    'subir_fotos': 'No tienes permiso para subir o borrar fotos en esta inspección.',
    'analizar': 'No tienes permiso para analizar fotos de esta inspección.',
    'editar_reporte': 'No tienes permiso para editar el reporte de esta inspección.',
    'editar_inspeccion': 'No tienes permiso para editar esta inspección.',
    LIDER: 'Solo el líder de la inspección puede hacer esto.',
}


def es_lider(usuario, inspeccion):
    return usuario.is_superuser or (inspeccion.lider_id is not None and inspeccion.lider_id == usuario.id)


def membresia(usuario, inspeccion):
    """The user's ``InspeccionMiembro`` row (cached on the instance per user), or None."""
    cache = inspeccion.__dict__.setdefault('_membresias', {})
    if usuario.id not in cache:
        cache[usuario.id] = InspeccionMiembro.objects.filter(inspeccion=inspeccion, usuario=usuario).first()
    return cache[usuario.id]


def puede_ver(usuario, inspeccion):
    return not inspeccion.privada or es_lider(usuario, inspeccion) or membresia(usuario, inspeccion) is not None


def permisos_de(usuario, inspeccion):
    """``{ver, es_lider, subir_fotos, analizar, editar_reporte, editar_inspeccion}`` for the UI."""
    lider = es_lider(usuario, inspeccion)
    miembro = membresia(usuario, inspeccion)
    if lider:
        concedidos = dict.fromkeys(InspeccionMiembro.PERMISOS, True)
    elif miembro is not None:
        concedidos = miembro.permisos()
    else:
        concedidos = dict.fromkeys(InspeccionMiembro.PERMISOS, False)
    return {'ver': puede_ver(usuario, inspeccion), 'es_lider': lider, **concedidos}


def condicion_visible(usuario, prefijo=''):
    """``Q`` matching the inspections ``usuario`` may read, or None when it reads all (superuser).

    ``prefijo`` reaches inspections through a relation, e.g. ``'inspecciones_casco__'``
    from ``Buque`` to filter an aggregate. Membership goes through a subquery (no join).
    """
    if usuario.is_superuser:
        return None
    propias = InspeccionMiembro.objects.filter(usuario=usuario).values('inspeccion_id')
    return (Q(**{f'{prefijo}privada': False}) | Q(**{f'{prefijo}lider': usuario})
            | Q(**{f'{prefijo}id__in': propias}))


def visibles_para(usuario, queryset):
    """Inspections ``usuario`` may read."""
    condicion = condicion_visible(usuario)
    return queryset if condicion is None else queryset.filter(condicion)


def exigir(usuario, inspeccion, permiso=None):
    """Raise 404 when the inspection is unreadable, 403 when ``permiso`` is missing.

    ``permiso`` is one of ``InspeccionMiembro.PERMISOS``, ``LIDER``, or None (read only).
    """
    if not puede_ver(usuario, inspeccion):
        raise Http404
    if permiso is None:
        return
    concedido = es_lider(usuario, inspeccion) if permiso == LIDER else permisos_de(usuario, inspeccion)[permiso]
    if not concedido:
        raise PermissionDenied(_MENSAJES[permiso])
