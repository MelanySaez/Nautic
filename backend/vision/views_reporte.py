"""
Inspection report endpoints: the editable draft (inspector texts and per-photo
validation of findings) and the PDF generated from it.
"""
import json
import logging

from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, renderer_classes
from rest_framework.renderers import BaseRenderer, JSONRenderer
from rest_framework.response import Response

from .almacenamiento import url_archivo
from .models import FotoInspeccion, InspeccionCasco, ReporteInspeccion, ValidacionFoto
from .reporte import borrador_de, clases_anomalia, fotos_revisables, generar_pdf

logger = logging.getLogger(__name__)

# Text fields of the draft and their maximum length.
_TEXTOS = {
    'conclusion': 5000,
    'observaciones': 5000,
    'recomendaciones': 5000,
    'inspector_nombre': ReporteInspeccion._meta.get_field('inspector_nombre').max_length,
    'inspector_cargo': ReporteInspeccion._meta.get_field('inspector_cargo').max_length,
}
_NOTA_MAX = 2000
_CAMPOS = set(_TEXTOS) | {'fotos'}
_CAMPOS_FOTO = {'foto_id', 'descartadas', 'nota'}


def _borrador_to_dict(inspeccion, request=None):
    borrador = borrador_de(inspeccion)
    data = {campo: getattr(borrador, campo) if borrador else '' for campo in _TEXTOS}
    data['actualizado'] = borrador.fecha_modificacion.isoformat() if borrador else None
    data['fotos'] = [
        {
            'foto_id': foto.id,
            'seccion': {'codigo': foto.seccion.codigo, 'nombre': foto.seccion.nombre},
            'imagen': url_archivo(foto.imagen_anotada or foto.imagen_original, request),
            'severidad': foto.severidad,
            'nota': validacion.nota if validacion else '',
            'hallazgos': hallazgos,
        }
        for foto, validacion, hallazgos in fotos_revisables(inspeccion)
    ]
    return data


def _validar_texto(valor, maximo):
    """Returns (trimmed text, error message or None)."""
    if not isinstance(valor, str):
        return None, 'Debe ser texto.'
    valor = valor.strip()
    if len(valor) > maximo:
        return None, f'Máximo {maximo} caracteres.'
    return valor, None


def _validar_fotos(inspeccion, valor):
    """
    Validate the ``fotos`` list of a PATCH.
    Returns (list of (foto, cambios) to save, list of error messages).
    """
    if not isinstance(valor, list):
        return [], ['Debe ser una lista.']
    ids = [item.get('foto_id') for item in valor if isinstance(item, dict)]
    fotos = {f.id: f for f in FotoInspeccion.objects.filter(
        pk__in=[i for i in ids if isinstance(i, int) and not isinstance(i, bool)])}

    limpias, errores = [], []
    for posicion, item in enumerate(valor, start=1):
        if not isinstance(item, dict):
            errores.append(f'Elemento {posicion}: debe ser un objeto.')
            continue
        desconocidos = sorted(set(item) - _CAMPOS_FOTO)
        foto = fotos.get(item.get('foto_id'))
        if desconocidos:
            errores.append(f"Elemento {posicion}: campos desconocidos: {', '.join(desconocidos)}.")
            continue
        if foto is None or foto.inspeccion_id != inspeccion.id:
            errores.append(f'Elemento {posicion}: la foto no pertenece a esta inspección.')
            continue
        if foto.estado != FotoInspeccion.Estado.COMPLETADA:
            errores.append(f'Foto {foto.id}: todavía no está analizada.')
            continue
        cambios = {}
        if 'descartadas' in item:
            descartadas = item['descartadas']
            if not isinstance(descartadas, list) or not all(isinstance(c, str) for c in descartadas):
                errores.append(f'Foto {foto.id}: descartadas debe ser una lista de clases.')
                continue
            ajenas = sorted(set(descartadas) - clases_anomalia(foto))
            if ajenas:
                errores.append(f"Foto {foto.id}: la foto no tiene estas anomalías: {', '.join(ajenas)}.")
                continue
            cambios['descartadas'] = sorted(set(descartadas))
        if 'nota' in item:
            nota, error = _validar_texto(item['nota'], _NOTA_MAX)
            if error:
                errores.append(f'Foto {foto.id}: nota: {error}')
                continue
            cambios['nota'] = nota
        limpias.append((foto, cambios))
    return limpias, errores


class _PdfRenderer(BaseRenderer):
    """Lets clients that accept only ``application/pdf`` pass content negotiation.

    The report itself is a plain ``HttpResponse``; this renderer only serves the
    JSON error bodies (404, 500), as ``application/json``, when it is the negotiated one.
    """
    media_type = 'application/pdf'
    format = 'pdf'
    charset = None

    def render(self, data, accepted_media_type=None, renderer_context=None):
        if isinstance(data, bytes):
            return data
        # An error body (404, 500) is JSON: label it as such instead of as a corrupt PDF.
        respuesta = (renderer_context or {}).get('response')
        if respuesta is not None:
            respuesta['Content-Type'] = 'application/json'
        return json.dumps(data).encode('utf-8')


@extend_schema(
    methods=['GET'],
    tags=['Visión IA'],
    summary='Borrador del reporte de una inspección',
    description=(
        'Textos del inspector (`conclusion`, `observaciones`, `recomendaciones`, `inspector_nombre`, '
        '`inspector_cargo`; vacíos si nunca se guardó, con `actualizado` nulo) y las fotos analizadas '
        'con anomalías, cada una con sus `hallazgos` (marcados `descartado` si el inspector los '
        'descartó como falsos positivos) y su `nota`.'
    ),
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
)
@extend_schema(
    methods=['PATCH'],
    tags=['Visión IA'],
    summary='Editar el borrador del reporte',
    description=(
        'Actualiza solo lo enviado: los textos del inspector y, en `fotos`, una lista de '
        '`{foto_id, descartadas?, nota?}` (`descartadas` reemplaza la lista de clases descartadas '
        'de esa foto). Solo se aceptan fotos analizadas de esta inspección y clases de anomalía que '
        'la foto tenga. Ante cualquier error responde 400 con `campos` y no guarda nada.'
    ),
    request={'application/json': {'type': 'object', 'additionalProperties': True}},
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
)
@api_view(['GET', 'PATCH'])
def api_vision_inspeccion_reporte(request, inspeccion_id):
    """
    GET   /api/vision/inspecciones/<id>/reporte/  → borrador + fotos revisables
    PATCH /api/vision/inspecciones/<id>/reporte/  → edita textos y validaciones
    """
    inspeccion = get_object_or_404(InspeccionCasco, pk=inspeccion_id)
    if request.method == 'GET':
        return Response(_borrador_to_dict(inspeccion, request))

    data = request.data
    if not hasattr(data, 'keys'):
        return Response({'error': 'Se esperaba un objeto JSON.'}, status=400)

    errores, textos = {}, {}
    for clave in sorted(set(data) - _CAMPOS):
        errores[clave] = ['Campo desconocido o no editable.']
    for campo, maximo in _TEXTOS.items():
        if campo in data:
            valor, error = _validar_texto(data[campo], maximo)
            if error:
                errores[campo] = [error]
            else:
                textos[campo] = valor
    fotos = []
    if 'fotos' in data:
        fotos, errores_fotos = _validar_fotos(inspeccion, data['fotos'])
        if errores_fotos:
            errores['fotos'] = errores_fotos
    if errores:
        return Response({'error': 'Datos inválidos.', 'campos': errores}, status=400)

    with transaction.atomic():
        borrador, _ = ReporteInspeccion.objects.get_or_create(inspeccion=inspeccion)
        for campo, valor in textos.items():
            setattr(borrador, campo, valor)
        borrador.save()  # always: `actualizado` records the last review
        for foto, cambios in fotos:
            ValidacionFoto.objects.update_or_create(foto=foto, defaults=cambios)

    inspeccion = InspeccionCasco.objects.get(pk=inspeccion.pk)
    return Response(_borrador_to_dict(inspeccion, request))


@extend_schema(
    tags=['Visión IA'],
    summary='Reporte PDF de una inspección',
    description=(
        'Genera el reporte en PDF (adjunto `reporte-inspeccion-<id>.pdf`) con el borrador guardado: '
        'resumen ejecutivo, datos del buque, hallazgos por sección, evidencia fotográfica, secciones '
        'no inspeccionadas, metodología, y conclusión, observaciones, recomendaciones y firma del '
        'inspector. Los hallazgos descartados no se incluyen. Se genera aunque haya fotos pendientes.'
    ),
    responses={(200, 'application/pdf'): OpenApiTypes.BINARY, 404: OpenApiTypes.OBJECT},
)
@api_view(['GET'])
@renderer_classes([JSONRenderer, _PdfRenderer])
def api_vision_inspeccion_reporte_pdf(request, inspeccion_id):
    """
    GET /api/vision/inspecciones/<id>/reporte/pdf/  → PDF adjunto
    """
    inspeccion = get_object_or_404(InspeccionCasco.objects.select_related('buque'), pk=inspeccion_id)
    try:
        pdf = generar_pdf(inspeccion)
    except Exception:
        logger.exception("No se pudo generar el reporte de la inspección %s", inspeccion_id)
        return Response({'error': 'No se pudo generar el reporte.'}, status=500)
    respuesta = HttpResponse(pdf, content_type='application/pdf')
    respuesta['Content-Disposition'] = f'attachment; filename="reporte-inspeccion-{inspeccion.id}.pdf"'
    return respuesta
