import asyncio
import base64
import json
import logging
import os
import time
import uuid

from PIL import Image
from django.conf import settings
from django.http import HttpResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiExample
from drf_spectacular.types import OpenApiTypes

from core_engine import ImageProcessor
from api.models import Buque
from .inference import DEFAULT_CONFIDENCE, DEFAULT_IOU, get_processor
from .models import SeccionCasco, InspeccionCasco, FotoInspeccion
from .pubsub import publicar_evento, suscribirse
from .ratelimit import check_upload_rate, get_client_ip, track_concurrent_start
from .tasks import procesar_foto

logger = logging.getLogger(__name__)

# Extensiones y content-types de imagen aceptados
_ALLOWED_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.bmp', '.webp', '.tiff', '.tif'}
_ALLOWED_IMAGE_CONTENT_TYPES = {
    'image/jpeg', 'image/png', 'image/bmp', 'image/webp', 'image/tiff',
}


def _validar_imagen(archivo):
    """
    Valida que un archivo subido sea una imagen real.
    Retorna (ok: bool, error_msg: str|None).
    """
    # 1. Verificar extensión
    extension = os.path.splitext(archivo.name)[1].lower()
    if extension not in _ALLOWED_IMAGE_EXTENSIONS:
        return False, f'Extensión no permitida: {extension}. Aceptadas: {", ".join(sorted(_ALLOWED_IMAGE_EXTENSIONS))}'

    # 2. Verificar content type del navegador
    if archivo.content_type and archivo.content_type not in _ALLOWED_IMAGE_CONTENT_TYPES:
        return False, f'Tipo de archivo no permitido: {archivo.content_type}'

    # 3. Verificar que PIL pueda abrir la imagen (magic bytes)
    try:
        archivo.seek(0)
        img = Image.open(archivo)
        img.verify()  # Verifica integridad sin decodificar completamente
        archivo.seek(0)  # Rebobinar para lectura posterior
    except Exception:
        return False, 'El archivo no es una imagen válida o está corrupto.'

    return True, None


@extend_schema(
    tags=["Visión Artificial"],
    summary="Detectar anomalías en una imagen",
    description=(
        "Recibe una imagen de casco naval y devuelve la detección de anomalías "
        "usando el modelo YOLO de nautic_core. "
        "Por defecto retorna directamente la imagen JPEG anotada con bounding boxes. "
        "Con `retornar_imagen=true` devuelve un JSON con las detecciones y la imagen en base64.\n\n"
        "**Clases detectables:** sea_chest_grating, paint_peel, over_board_valve, defect, "
        "corrosion, propeller, anode, bilge_keel, marine_growth, ship_hull."
    ),
    request={
        "multipart/form-data": {
            "type": "object",
            "required": ["imagen"],
            "properties": {
                "imagen": {
                    "type": "string",
                    "format": "binary",
                    "description": "Imagen a analizar",
                },
                "confidence": {
                    "type": "number",
                    "default": 0.25,
                    "description": "Umbral de confianza (0.01–1.0)",
                },
                "iou": {
                    "type": "number",
                    "default": 0.45,
                    "description": "Umbral IOU para NMS (0.01–1.0)",
                },
                "retornar_imagen": {
                    "type": "string",
                    "enum": ["true", "false"],
                    "default": "false",
                    "description": "Si true, responde JSON con detecciones e imagen en base64",
                },
            },
        }
    },
    responses={
        200: OpenApiTypes.BINARY,
        400: OpenApiTypes.OBJECT,
        500: OpenApiTypes.OBJECT,
    },
    examples=[
        OpenApiExample(
            name="Respuesta JSON (retornar_imagen=true)",
            response_only=True,
            value={
                "detecciones": [
                    {
                        "class_id": 4,
                        "class_name": "corrosion",
                        "confidence": 0.87,
                        "bbox": {
                            "x1": 120.0,
                            "y1": 80.0,
                            "x2": 340.0,
                            "y2": 210.0,
                            "x_center": 230.0,
                            "y_center": 145.0,
                            "width": 220.0,
                            "height": 130.0,
                        },
                    }
                ],
                "total_detecciones": 1,
                "tiempo_inferencia_ms": 142.5,
                "tamano_imagen": {"width": 640, "height": 480},
                "parametros": {"confidence": 0.25, "iou": 0.45},
                "imagen_anotada_base64": "<base64_string>",
            },
        )
    ],
)
@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
def api_ai_anomalias(request):
    """
    Detecta anomalías en una imagen usando el modelo YOLO de nautic_core.

    Parámetros (multipart/form-data):
        imagen      (file, requerido)  — imagen a analizar
        confidence  (float, opcional)  — umbral de confianza, por defecto 0.25
        iou         (float, opcional)  — umbral IOU para NMS, por defecto 0.45
        retornar_imagen (bool, opcional) — si 'true' devuelve la imagen anotada
                                          como base64 en JSON; de lo contrario
                                          devuelve directamente el archivo JPEG.
                                          Por defecto false.

    Respuesta (retornar_imagen=false — default):
        Content-Type: image/jpeg
        Body: imagen JPEG con bounding boxes y etiquetas de confianza dibujadas

    Respuesta (retornar_imagen=true):
        Content-Type: application/json
        {
            "detecciones": [...],
            "total_detecciones": int,
            "tiempo_inferencia_ms": float,
            "parametros": {"confidence": float, "iou": float},
            "imagen_anotada_base64": "..."
        }
    """
    if "imagen" not in request.FILES:
        return Response(
            {"error": 'Se requiere el campo "imagen" en el formulario.'}, status=400
        )

    # --- Leer parámetros opcionales ---
    try:
        confidence = float(request.data.get("confidence", DEFAULT_CONFIDENCE))
    except (ValueError, TypeError):
        return Response(
            {"error": 'El parámetro "confidence" debe ser un número decimal.'},
            status=400,
        )

    try:
        iou = float(request.data.get("iou", DEFAULT_IOU))
    except (ValueError, TypeError):
        return Response(
            {"error": 'El parámetro "iou" debe ser un número decimal.'}, status=400
        )

    if not (0.0 < confidence <= 1.0):
        return Response(
            {"error": 'El parámetro "confidence" debe estar entre 0.01 y 1.0.'},
            status=400,
        )

    if not (0.0 < iou <= 1.0):
        return Response(
            {"error": 'El parámetro "iou" debe estar entre 0.01 y 1.0.'}, status=400
        )

    retornar_imagen = request.data.get("retornar_imagen", "false").lower() == "true"

    # --- Leer bytes de la imagen ---
    imagen_archivo = request.FILES["imagen"]
    try:
        imagen_bytes = imagen_archivo.read()
    except Exception as e:
        return Response(
            {"error": f"Error al leer el archivo de imagen: {str(e)}"}, status=400
        )

    # --- Obtener procesador (singleton si se usan los umbrales por defecto) ---
    try:
        if confidence == DEFAULT_CONFIDENCE and iou == DEFAULT_IOU:
            processor = get_processor()
        else:
            # Umbrales custom: instancia efímera (modelo se recarga). Para uso
            # frecuente con umbrales distintos al default, considerar cachear
            # por (conf, iou).
            processor = ImageProcessor(
                confidence_threshold=confidence,
                iou_threshold=iou,
            )
    except FileNotFoundError as e:
        return Response({"error": f"Modelo YOLO no encontrado: {str(e)}"}, status=500)
    except Exception as e:
        return Response(
            {"error": f"Error al inicializar el procesador: {str(e)}"}, status=500
        )

    # --- Ejecutar inferencia + renderizado (delegado a nautic_core) ---
    try:
        imagen_anotada_bytes, resultados = asyncio.run(
            processor.process_and_visualize(imagen_bytes)
        )
    except Exception as e:
        return Response({"error": f"Error durante la inferencia: {str(e)}"}, status=500)

    # --- Devolver respuesta ---
    if retornar_imagen:
        imagen_b64 = base64.b64encode(imagen_anotada_bytes).decode("utf-8")
        return Response(
            {
                "detecciones": resultados["detections"],
                "total_detecciones": resultados["detection_count"],
                "tiempo_inferencia_ms": round(resultados["inference_time_ms"], 2),
                "tamano_imagen": resultados["image_size"],
                "parametros": {
                    "confidence": confidence,
                    "iou": iou,
                },
                "imagen_anotada_base64": imagen_b64,
            }
        )

    # Respuesta por defecto: imagen JPEG directa
    return HttpResponse(
        imagen_anotada_bytes,
        content_type="image/jpeg",
        headers={
            "X-Detecciones": str(resultados["detection_count"]),
            "X-Inferencia-Ms": str(round(resultados["inference_time_ms"], 2)),
            "X-Confidence": str(confidence),
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# Helpers de serialización
# ─────────────────────────────────────────────────────────────────────────────

def _media_url(path, request=None):
    """Convierte un path relativo (incluye prefijo media/) en URL absoluta."""
    if not path:
        return None
    s = path.replace('\\', '/')
    if request:
        return request.build_absolute_uri('/' + s.lstrip('/'))
    return '/' + s.lstrip('/')


def _seccion_to_dict(s):
    return {
        'id': s.id,
        'codigo': s.codigo,
        'nombre': s.nombre,
        'descripcion': s.descripcion,
        'orden': s.orden,
    }


def _foto_to_dict(f, request=None):
    return {
        'id': f.id,
        'seccion': _seccion_to_dict(f.seccion),
        'imagen_original': _media_url(f.imagen_original, request),
        'imagen_anotada': _media_url(f.imagen_anotada, request),
        'detecciones': f.detecciones,
        'tiempo_inferencia_ms': f.tiempo_inferencia_ms,
        'severidad': f.severidad,
        'estado': f.estado,
        'error_detalle': f.error_detalle,
        'fecha_creacion': f.fecha_creacion.isoformat(),
    }


def _inspeccion_to_dict(insp, include_fotos=False, request=None):
    d = {
        'id': insp.id,
        'buque_id': insp.buque_id,
        'buque_nombre': insp.buque.nombre,
        'descripcion': insp.descripcion,
        'tomado_por': insp.tomado_por,
        'fecha_creacion': insp.fecha_creacion.isoformat(),
        'fecha_modificacion': insp.fecha_modificacion.isoformat(),
        'total_fotos': insp.fotos.count(),
    }
    if include_fotos:
        fotos_qs = insp.fotos.select_related('seccion').order_by('fecha_creacion')
        d['fotos'] = [_foto_to_dict(f, request) for f in fotos_qs]
    return d


# ─────────────────────────────────────────────────────────────────────────────
# Dispatch asíncrono — encolar tarea Celery (broker RabbitMQ)
# ─────────────────────────────────────────────────────────────────────────────

def _disparar_procesamiento(foto_id):
    """Encola la tarea Celery ``vision.procesar_foto`` para la foto dada."""
    procesar_foto.apply_async(kwargs={"foto_id": foto_id})


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints — Secciones del casco
# ─────────────────────────────────────────────────────────────────────────────

@extend_schema(
    tags=['Inspección IA'],
    summary='Listar secciones del casco',
    description='Devuelve el catálogo completo de zonas físicas del casco (FWD-BTM, MID-SS-P, etc.).',
)
@api_view(['GET'])
def api_vision_secciones(request):
    """
    GET /api/vision/secciones/
    Lista el catálogo completo de secciones del casco.
    """
    secciones = SeccionCasco.objects.all()
    return Response([_seccion_to_dict(s) for s in secciones])


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints — Inspecciones
# ─────────────────────────────────────────────────────────────────────────────

@extend_schema(
    methods=['GET'],
    tags=['Inspección IA'],
    summary='Listar inspecciones de casco',
    description='Lista inspecciones ordenadas por fecha. Acepta ?buque_id= para filtrar.',
    parameters=[
        OpenApiParameter('buque_id', int, OpenApiParameter.QUERY,
                         description='Filtrar por ID de buque', required=False),
    ],
    responses={200: OpenApiTypes.OBJECT},
)
@extend_schema(
    methods=['POST'],
    tags=['Inspección IA'],
    summary='Crear inspección de casco',
    description='Crea una nueva sesión de inspección para un buque.',
    request={
        'application/json': {
            'type': 'object',
            'required': ['buque_id'],
            'properties': {
                'buque_id': {'type': 'integer', 'description': 'ID del buque'},
                'descripcion': {'type': 'string', 'description': 'Descripción de la inspección (opcional)'},
                'tomado_por': {'type': 'string', 'description': 'Nombre del inspector (opcional)'},
            },
        }
    },
    responses={201: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT},
)
@api_view(['GET', 'POST'])
def api_vision_inspecciones(request):
    """
    GET  /api/vision/inspecciones/          → lista inspecciones (filtra por ?buque_id=)
    POST /api/vision/inspecciones/          → crea una nueva inspección
    """
    if request.method == 'GET':
        qs = InspeccionCasco.objects.select_related('buque').order_by('-fecha_creacion')
        buque_id = request.query_params.get('buque_id')
        if buque_id:
            qs = qs.filter(buque_id=buque_id)
        return Response([_inspeccion_to_dict(i, request=request) for i in qs])

    # POST: crear inspección
    buque_id = request.data.get('buque_id')
    if not buque_id:
        return Response({'error': 'El campo buque_id es requerido.'}, status=400)

    buque = get_object_or_404(Buque, pk=buque_id)
    insp = InspeccionCasco.objects.create(
        buque=buque,
        descripcion=request.data.get('descripcion', ''),
        tomado_por=request.data.get('tomado_por', ''),
    )
    return Response(_inspeccion_to_dict(insp, request=request), status=201)


@extend_schema(
    tags=['Inspección IA'],
    summary='Detalle de una inspección',
    description='Devuelve la inspección con todas sus fotos, secciones y detecciones del modelo YOLO.',
)
@api_view(['GET', 'DELETE'])
def api_vision_inspeccion_detalle(request, inspeccion_id):
    """
    GET    /api/vision/inspecciones/<id>/  → detalle con fotos
    DELETE /api/vision/inspecciones/<id>/  → elimina la inspección y todos sus archivos físicos
    """
    insp = get_object_or_404(
        InspeccionCasco.objects.select_related('buque'),
        pk=inspeccion_id,
    )

    if request.method == 'DELETE':
        for foto in insp.fotos.all():
            for path_field in [foto.imagen_original, foto.imagen_anotada]:
                if path_field:
                    full_path = os.path.join(settings.BASE_DIR, path_field)
                    if os.path.exists(full_path):
                        os.remove(full_path)
        insp.delete()
        return Response(status=204)

    return Response(_inspeccion_to_dict(insp, include_fotos=True, request=request))


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints — Fotos
# ─────────────────────────────────────────────────────────────────────────────

@extend_schema(
    tags=['Inspección IA'],
    summary='Subir foto a una inspección',
    description=(
        'Guarda la foto en disco y dispara el análisis YOLO en segundo plano.\n\n'
        'Responde inmediatamente con estado=pendiente (HTTP 202).\n\n'
        'Usar GET /api/vision/fotos/<id>/ para polling del resultado.'
    ),
    request={
        'multipart/form-data': {
            'type': 'object',
            'required': ['imagen', 'seccion_id'],
            'properties': {
                'imagen': {'type': 'string', 'format': 'binary', 'description': 'Foto del casco (JPG/PNG)'},
                'seccion_id': {'type': 'integer', 'description': 'ID de la sección del casco'},
            },
        }
    },
    responses={202: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT},
)
@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def api_vision_subir_foto(request, inspeccion_id):
    """
    POST /api/vision/inspecciones/<id>/fotos/
    Sube una foto a una inspección.

    Parámetros (multipart/form-data):
        imagen     (file, requerido)  — foto del casco
        seccion_id (int, requerido)   — sección del casco a la que pertenece

    Respuesta inmediata (estado=pendiente).
    El procesamiento YOLO corre en segundo plano y actualiza el estado.
    Usar GET /api/vision/fotos/<id>/ para hacer polling del resultado.
    """
    insp = get_object_or_404(InspeccionCasco, pk=inspeccion_id)

    ip = get_client_ip(request)
    ok, err = check_upload_rate(ip)
    if not ok:
        return Response({'error': err}, status=429)

    seccion_id = request.data.get('seccion_id')
    if not seccion_id:
        return Response({'error': 'El campo seccion_id es requerido.'}, status=400)
    seccion = get_object_or_404(SeccionCasco, pk=seccion_id)

    if 'imagen' not in request.FILES:
        return Response({'error': 'El campo imagen es requerido.'}, status=400)

    archivo = request.FILES['imagen']

    # Validar que sea imagen real antes de guardar
    img_ok, img_error = _validar_imagen(archivo)
    if not img_ok:
        return Response({'error': img_error}, status=400)

    # Guardar imagen original en media/inspecciones/originales/
    extension = os.path.splitext(archivo.name)[1].lower() or '.jpg'
    nombre_original = f"media/inspecciones/originales/{uuid.uuid4().hex}{extension}"
    ruta_original = os.path.join(settings.BASE_DIR, nombre_original)
    os.makedirs(os.path.dirname(ruta_original), exist_ok=True)
    with open(ruta_original, 'wb') as fh:
        for chunk in archivo.chunks():
            fh.write(chunk)

    # Crear registro con estado=pendiente
    foto = FotoInspeccion.objects.create(
        inspeccion=insp,
        seccion=seccion,
        imagen_original=nombre_original,
    )

    foto_dict = _foto_to_dict(foto, request)
    # Notificar a clientes SSE conectados a esta inspección
    publicar_evento(insp.id, event='foto-created', data={'foto': foto_dict})

    return Response(foto_dict, status=202)


@extend_schema(
    methods=['GET'],
    tags=['Inspección IA'],
    summary='Estado de una foto',
    description='Devuelve el estado actual, sección y detecciones de la foto. Usar para polling.',
    responses={200: OpenApiTypes.OBJECT},
)
@extend_schema(
    methods=['POST'],
    tags=['Inspección IA'],
    summary='Reintentar análisis de foto',
    description='Reintenta el procesamiento YOLO si la foto está en estado "error".',
    responses={202: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT},
)
@api_view(['GET', 'POST', 'DELETE'])
def api_vision_foto_detalle(request, foto_id):
    """
    GET    /api/vision/fotos/<id>/  → estado y resultado de una foto (polling)
    POST   /api/vision/fotos/<id>/  → dispara análisis si estado=pendiente o error
    DELETE /api/vision/fotos/<id>/  → elimina la foto y sus archivos físicos
    """
    foto = get_object_or_404(FotoInspeccion.objects.select_related('seccion'), pk=foto_id)

    if request.method == 'GET':
        return Response(_foto_to_dict(foto, request))

    if request.method == 'DELETE':
        inspeccion_id = foto.inspeccion_id
        foto_id_borrado = foto.pk
        for path_field in [foto.imagen_original, foto.imagen_anotada]:
            if path_field:
                full_path = os.path.join(settings.BASE_DIR, path_field)
                if os.path.exists(full_path):
                    os.remove(full_path)
        foto.delete()
        publicar_evento(
            inspeccion_id,
            event='foto-deleted',
            data={'foto_id': foto_id_borrado, 'inspeccion_id': inspeccion_id},
        )
        return Response(status=204)

    # POST: disparar análisis (pendiente o error)
    if foto.estado not in [FotoInspeccion.Estado.PENDIENTE, FotoInspeccion.Estado.ERROR]:
        return Response(
            {'error': f'Solo se puede analizar una foto en estado "pendiente" o "error". Estado actual: {foto.estado}.'},
            status=400,
        )
    ip = get_client_ip(request)
    ok, err = track_concurrent_start(ip, foto.id)
    if not ok:
        return Response({'error': err}, status=429)
    foto.estado = FotoInspeccion.Estado.PENDIENTE
    foto.error_detalle = None
    foto.save(update_fields=['estado', 'error_detalle'])
    _disparar_procesamiento(foto.id)
    return Response(_foto_to_dict(foto, request), status=202)


@api_view(['POST'])
def api_vision_analizar_inspeccion(request, inspeccion_id):
    """
    POST /api/vision/inspecciones/<id>/analizar/
    Dispara el análisis YOLO para todas las fotos en estado 'pendiente' de la inspección.
    """
    insp = get_object_or_404(InspeccionCasco, pk=inspeccion_id)
    fotos = FotoInspeccion.objects.filter(
        inspeccion=insp,
        estado=FotoInspeccion.Estado.PENDIENTE,
    )
    if not fotos.exists():
        return Response({'error': 'No hay fotos pendientes de análisis.'}, status=400)

    ip = get_client_ip(request)
    dispatched = 0
    skipped = 0
    for foto in fotos:
        ok, _ = track_concurrent_start(ip, foto.id)
        if not ok:
            skipped += 1
            continue
        _disparar_procesamiento(foto.id)
        dispatched += 1

    if dispatched == 0:
        return Response(
            {'error': f'Límite de tareas concurrentes alcanzado. {skipped} foto(s) en espera.'},
            status=429,
        )
    return Response({'iniciadas': dispatched, 'omitidas_por_limite': skipped}, status=202)


# ─────────────────────────────────────────────────────────────────────────────
# SSE — stream de eventos en tiempo real (sustituye al polling del frontend)
# ─────────────────────────────────────────────────────────────────────────────

def _sse_format(data: str, event: str | None = None, event_id: str | None = None) -> str:
    """Formatea un mensaje SSE según la especificación text/event-stream."""
    out = []
    if event:
        out.append(f"event: {event}")
    if event_id:
        out.append(f"id: {event_id}")
    # `data:` admite múltiples líneas; aquí mandamos JSON serializado en una sola
    out.append(f"data: {data}")
    out.append("")  # línea vacía = fin de mensaje
    out.append("")
    return "\n".join(out)


@csrf_exempt
@require_http_methods(['GET'])
def api_vision_inspeccion_stream(request, inspeccion_id):
    """
    GET /api/vision/inspecciones/<id>/stream/
    Server-Sent Events: empuja eventos de cambio de estado de fotos al frontend.
    """
    # Verificar que la inspección existe antes de abrir el stream
    get_object_or_404(InspeccionCasco, pk=inspeccion_id)

    keepalive_seconds = getattr(settings, 'SSE_KEEPALIVE_SECONDS', 15)

    def event_stream():
        try:
            pubsub = suscribirse(inspeccion_id)
        except Exception:
            logger.exception("No se pudo suscribir a Redis pub/sub")
            yield _sse_format(json.dumps({"error": "pubsub_unavailable"}), event="error")
            return

        # Handshake: avisa al cliente que el stream está activo
        yield _sse_format(
            json.dumps({"inspeccion_id": inspeccion_id, "ts": int(time.time())}),
            event="ready",
        )

        # Sugerir al browser un retry de 5s si pierde la conexión
        yield "retry: 5000\n\n"

        try:
            last_keepalive = time.time()
            while True:
                # get_message con timeout corto → permite intercalar keepalives
                msg = pubsub.get_message(timeout=1.0)
                if msg and msg.get('type') == 'message':
                    # El productor envía {"event": "<tipo>", "data": {...}}.
                    # Desempaquetamos: el browser recibe `event: <tipo>` y `data: <json>`.
                    try:
                        envelope = json.loads(msg['data'])
                        evt = envelope.get('event') or 'message'
                        payload = json.dumps(envelope.get('data', {}))
                    except (ValueError, TypeError):
                        evt = 'message'
                        payload = msg['data']
                    yield _sse_format(payload, event=evt)
                # Keepalive periódico (comentario SSE: línea con prefijo `:`)
                if time.time() - last_keepalive >= keepalive_seconds:
                    yield ":keepalive\n\n"
                    last_keepalive = time.time()
        except GeneratorExit:
            # Cliente cerró conexión
            pass
        except Exception:
            logger.exception("Error en SSE stream (inspeccion=%s)", inspeccion_id)
        finally:
            try:
                pubsub.close()
            except Exception:
                pass

    response = StreamingHttpResponse(
        event_stream(),
        content_type='text/event-stream',
    )
    # Cabeceras críticas para SSE: desactivar buffering en proxies y caches.
    # `Connection: keep-alive` lo gestiona automáticamente el servidor WSGI/ASGI;
    # setearlo aquí dispara AssertionError("Hop-by-hop header not allowed").
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'  # nginx
    return response
