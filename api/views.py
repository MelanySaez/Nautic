from rest_framework.decorators import api_view, parser_classes
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404, redirect, render
from .models import (
    Grupo,
    Subgrupo,
    Sistema,
    Subsistema,
    Buque,
    Equipo,
    Parametro,
    SubsistemaParametro,
    EquipoParametro,
    Ronda,
    RondaLectura,
)
from django.db.models import F, Count, Q, CharField, Min, Max, Sum
from django.db.models.functions import Coalesce, Cast
from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponseRedirect, HttpResponse
from django.http import HttpResponseRedirect, JsonResponse
from django.core.files.storage import default_storage
from django.urls import reverse
from django.conf import settings
from django.utils.text import slugify
from django.utils import timezone
from datetime import datetime, timedelta, time as timecls
import uuid
import json
import os
import re
import requests
import logging
from django.db import transaction
from django.db.models import CharField
from urllib.parse import unquote
from django.utils import timezone
from django.utils.dateparse import parse_date
from io import BytesIO
import qrcode
from django.utils.timezone import get_current_timezone



# 🔹 Enhanced Chat API endpoint
@api_view(["POST"])
def rondas(request):
    buque_id = request.GET.get("buque_id")
    buque_nombre = request.GET.get("buque_nombre", "Sin selección")
    return render(request, "rondas.html", {"buque_nombre": buque_nombre})


# 🔹 Estadísticas
def SWBS(request):
    return render(request, "SWBS.html")


# 🔹 Gestión de parámetros
def gestion_parametros(request):
    parametros = Parametro.objects.all().order_by("-created_at")
    return render(request, "gestion_parametros.html", {"parametros": parametros})


# ===== Páginas de Solicitudes (render placeholders)
@api_view(["GET"])
def api_grupos(request):
    grupos = list(Grupo.objects.values("id", "numero_de_referencia", "descripcion"))
    return Response(grupos)


@api_view(["POST"])
def api_subgrupos(request):
    grupo_id = request.data.get("grupo_id")
    subgrupos = list(
        Subgrupo.objects.filter(grupo_id=grupo_id).values(
            "id", "numero_de_referencia", "descripcion"
        )
    )
    return Response(subgrupos)


@api_view(["POST"])
def api_sistemas(request):
    subgrupo_id = request.data.get("subgrupo_id")
    sistemas = list(
        Sistema.objects.filter(subgrupo_id=subgrupo_id).values(
            "id", "numero_de_referencia", "descripcion"
        )
    )
    return Response(sistemas)


@api_view(["POST"])
def api_subsistemas(request):
    sistema_id = request.data.get("sistema_id")
    subsistemas = list(
        Subsistema.objects.filter(sistema_id=sistema_id).values(
            "id", "numero_de_referencia", "descripcion"
        )
    )
    return Response(subsistemas)


@api_view(["POST"])
def api_subsistemas_auto_create(request):
    """
    Crea automáticamente un subsistema para un sistema si no existe ninguno.
    El subsistema tendrá el mismo numero_de_referencia y descripcion que el sistema.
    
    Body: { "sistema_id": <int> }
    Returns: { "id", "numero_de_referencia", "descripcion", "sistema_id", "created": <bool> }
    """
    sistema_id = request.data.get("sistema_id")
    if not sistema_id:
        return Response({"error": "sistema_id es requerido"}, status=400)
    
    try:
        sistema = Sistema.objects.get(id=sistema_id)
    except Sistema.DoesNotExist:
        return Response({"error": "Sistema no encontrado"}, status=404)
    
    # Verificar si ya existe algún subsistema para este sistema
    subsistema_existente = Subsistema.objects.filter(sistema_id=sistema_id).first()
    
    if subsistema_existente:
        # Ya existe, retornar el existente
        return Response({
            "id": subsistema_existente.id,
            "numero_de_referencia": subsistema_existente.numero_de_referencia,
            "descripcion": subsistema_existente.descripcion,
            "sistema_id": subsistema_existente.sistema_id,
            "created": False
        })
    
    # No existe, crear uno nuevo con los mismos datos del sistema
    nuevo_subsistema = Subsistema.objects.create(
        sistema_id=sistema_id,
        numero_de_referencia=sistema.numero_de_referencia,
        descripcion=sistema.descripcion
    )
    
    return Response({
        "id": nuevo_subsistema.id,
        "numero_de_referencia": nuevo_subsistema.numero_de_referencia,
        "descripcion": nuevo_subsistema.descripcion,
        "sistema_id": nuevo_subsistema.sistema_id,
        "created": True
    }, status=201)


@api_view(["GET"])
def api_subsistemas_por_grupo(request, grupo_id):
    # Obtener todos los subsistemas asociados a ese grupo
    sistemas_ids = Sistema.objects.filter(subgrupo__grupo_id=grupo_id).values_list(
        "id", flat=True
    )
    subsistemas = Subsistema.objects.filter(sistema_id__in=sistemas_ids).values(
        "id", "numero_de_referencia", "descripcion"
    )
    return Response(list(subsistemas))


@api_view(["GET"])
def api_sistema_detail(request, sistema_id):
    """Obtener detalles de un sistema específico"""
    try:
        sistema = Sistema.objects.get(id=sistema_id)
        data = {
            "id": sistema.id,
            "numero_de_referencia": sistema.numero_de_referencia,
            "descripcion": sistema.descripcion,
            "subgrupo_id": sistema.subgrupo_id,
        }
        return Response(data)
    except Sistema.DoesNotExist:
        return Response({"error": "Sistema no encontrado"}, status=404)


@api_view(["GET"])
def api_subsistema_detail(request, subsistema_id):
    """Obtener detalles de un subsistema específico"""
    try:
        subsistema = Subsistema.objects.get(id=subsistema_id)
        data = {
            "id": subsistema.id,
            "numero_de_referencia": subsistema.numero_de_referencia,
            "descripcion": subsistema.descripcion,
            "sistema_id": subsistema.sistema_id,
        }
        return Response(data)
    except Subsistema.DoesNotExist:
        return Response({"error": "Subsistema no encontrado"}, status=404)


# ===== Entrenamiento: documentos por Sistema =====
from rest_framework.parsers import MultiPartParser, FormParser


@api_view(["GET"])
def api_equipos(request):
    grupo_id = request.GET.get("grupo_id")
    subgrupo_id = request.GET.get("subgrupo_id")
    sistema_id = request.GET.get("sistema_id")
    subsistema_id = request.GET.get("subsistema_id")
    buque_id = request.GET.get("buque_id")

    qs = Equipo.objects.select_related(
        "subgrupo__grupo", "sistema", "subsistema"
    ).annotate(
        referencia=Coalesce(
            F("codigo_cj"),
            Cast(F("subsistema__numero_de_referencia"), CharField()),
            Cast(F("sistema__numero_de_referencia"), CharField()),
            output_field=CharField(),
        )
    )

    # Filtros opcionales
    if grupo_id:
        qs = qs.filter(grupo_id=grupo_id)
    if subgrupo_id:
        qs = qs.filter(subgrupo_id=subgrupo_id)
    if sistema_id:
        qs = qs.filter(sistema_id=sistema_id)
    if subsistema_id:
        qs = qs.filter(subsistema_id=subsistema_id)
    if buque_id:
        qs = qs.filter(buque_id=buque_id)

    data = []
    cj_re = re.compile(r"CJ\s*[:#-]?\s*(\d{3,10})", re.IGNORECASE)
    for e in qs:
        sis = e.sistema
        ss = e.subsistema
        codigo_cj = e.codigo_cj
        if not codigo_cj:
            # Fallback: intenta extraer de campo parametros si tiene texto tipo 'CJ: 31122'
            if e.parametros:
                m = cj_re.search(e.parametros)
                if m:
                    codigo_cj = m.group(1)
        data.append(
            {
                "id": e.id,
                "grupo_id": e.grupo_id,
                "subgrupo_id": e.subgrupo_id,
                "sistema_id": e.sistema_id,
                "subsistema_id": e.subsistema_id,
                "buque_id": e.buque_id,
                "nombre_equipo": e.nombre_equipo,
                "parametros": e.parametros,
                "imagen": e.imagen,
                "referencia": e.referencia,
                "codigo_cj": codigo_cj,
                "descripcion": e.descripcion,
                "marca": e.marca,
                "modelo": e.modelo,
                "serial": e.serial,
                "created_at": (
                    e.created_at.isoformat()
                    if hasattr(e, "created_at") and e.created_at
                    else None
                ),
                # 👇 FK info para el front
                "grupo_numero_de_referencia": getattr(
                    getattr(e, "grupo", None), "numero_de_referencia", None
                ),
                "grupo_descripcion": getattr(
                    getattr(e, "grupo", None), "descripcion", None
                ),
                "subgrupo_numero_de_referencia": getattr(
                    getattr(e, "subgrupo", None), "numero_de_referencia", None
                ),
                "subgrupo_descripcion": getattr(
                    getattr(e, "subgrupo", None), "descripcion", None
                ),
                "sistema_numero_de_referencia": getattr(
                    sis, "numero_de_referencia", None
                ),
                "sistema_descripcion": getattr(sis, "descripcion", None),
                "subsistema_numero_de_referencia": getattr(
                    ss, "numero_de_referencia", None
                ),
                "subsistema_descripcion": getattr(ss, "descripcion", None),
            }
        )

    return Response(data)


@api_view(["GET"])
def api_equipos_con_rondas(request):
    """
    Endpoint para obtener equipos que tienen rondas registradas.
    Incluye paginación y filtros similares a historial de rondas.
    Devuelve información de equipos con el contador actual y cantidad de rondas.
    """
    # Parámetros de filtrado
    grupo_id = request.GET.get("grupo_id")
    subgrupo_id = request.GET.get("subgrupo_id")
    sistema_id = request.GET.get("sistema_id")
    subsistema_id = request.GET.get("subsistema_id")
    buque_id = request.GET.get("buque_id")
    
    # Parámetros de paginación
    page = int(request.GET.get("page", 1))
    page_size = int(request.GET.get("page_size", 10))
    
    # Consulta base: equipos que tienen al menos una ronda
    # Anotar con el conteo de rondas
    qs = Equipo.objects.filter(
        rondas__isnull=False
    ).select_related(
        "subgrupo__grupo", "sistema", "subsistema", "buque"
    ).annotate(
        referencia=Coalesce(
            F("codigo_cj"),
            Cast(F("subsistema__numero_de_referencia"), CharField()),
            Cast(F("sistema__numero_de_referencia"), CharField()),
            output_field=CharField(),
        ),
        total_rondas=Count('rondas', distinct=True)
    ).distinct()
    
    # Aplicar filtros
    if grupo_id:
        qs = qs.filter(grupo_id=grupo_id)
    if subgrupo_id:
        qs = qs.filter(subgrupo_id=subgrupo_id)
    if sistema_id:
        qs = qs.filter(sistema_id=sistema_id)
    if subsistema_id:
        qs = qs.filter(subsistema_id=subsistema_id)
    if buque_id:
        qs = qs.filter(buque_id=buque_id)
    
    # Total de equipos
    total = qs.count()
    
    # Aplicar paginación
    offset = (page - 1) * page_size
    qs_paginated = qs[offset:offset + page_size]
    
    # Construir respuesta
    data = []
    cj_re = re.compile(r"CJ\s*[:#-]?\s*(\d{3,10})", re.IGNORECASE)
    
    for e in qs_paginated:
        # Extraer código CJ
        codigo_cj = e.codigo_cj
        if not codigo_cj and e.parametros:
            m = cj_re.search(e.parametros)
            if m:
                codigo_cj = m.group(1)
        
        data.append({
            "id": e.id,
            "nombre_equipo": e.nombre_equipo,
            "codigo_cj": codigo_cj,
            "referencia": e.referencia,
            "numero_equipo_sap": e.numero_equipo_sap,
            "contador": e.contador,
            "total_rondas": e.total_rondas,  # Cantidad de rondas registradas
            # Información de relaciones
            "buque_nombre": e.buque.nombre if e.buque else None,
            "subsistema_descripcion": e.subsistema.descripcion if e.subsistema else None,
            "sistema_descripcion": e.sistema.descripcion if e.sistema else None,
            "grupo_id": e.grupo_id,
            "subgrupo_id": e.subgrupo_id,
            "sistema_id": e.sistema_id,
            "subsistema_id": e.subsistema_id,
            "buque_id": e.buque_id,
        })
    
    return Response({
        "results": data,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size
    })


@api_view(["GET"])
def api_cj_sugerido(request):
    """Devuelve sugerencia para el siguiente codigo_cj según buque + subsistema.

    Reglas:
      - Prefijo: numero_de_referencia del subsistema (4 o 5 dígitos). Si no hay subsistema -> error.
      - Sufijo secuencial único dentro (buque, subsistema):
            1..9 luego A..Z (una sola posición)
        Tras agotar Z, se permiten dos letras: AA, AB, AC ... ZZ.
      - Si ya se ha llegado a Z en sufijos de 1 char, front puede permitir ingresar 2 chars.
    Parámetros query:
      buque_id, subsistema_id, exclude_equipo_id (opcional - para excluir equipo actual al editar)
    Respuesta:
      {
        prefix: str,
        suggestion: str,             # codigo_cj sugerido completo
        suffix_suggestion: str,      # solo sufijo sugerido
        allow_two: bool,             # True si ya se agotó espacio de 1 char
        existing_suffixes_1: [...],  # sufijos de longitud 1 existentes
        existing_suffixes_2: [...],  # sufijos de longitud 2 existentes (si aplica)
        existing_codes: [...],
      }
    """
    buque_id = request.GET.get("buque_id")
    subsistema_id = request.GET.get("subsistema_id")
    exclude_equipo_id = request.GET.get(
        "exclude_equipo_id"
    )  # ID del equipo a excluir (cuando se está editando)

    if not buque_id or not subsistema_id:
        return Response({"error": "Debe indicar buque_id y subsistema_id"}, status=400)
    try:
        subsistema = Subsistema.objects.get(id=subsistema_id)
    except Subsistema.DoesNotExist:
        return Response({"error": "Subsistema no encontrado"}, status=404)

    prefix = str(subsistema.numero_de_referencia)
    # Trae todos los equipos de ese subsistema y buque con codigo_cj con ese prefijo
    # Excluir el equipo actual si se está editando
    query = Equipo.objects.filter(
        buque_id=buque_id, subsistema_id=subsistema_id, codigo_cj__startswith=prefix
    ).exclude(codigo_cj__isnull=True)

    if exclude_equipo_id:
        query = query.exclude(id=exclude_equipo_id)

    existentes = list(query.values_list("codigo_cj", flat=True))
    existing_suffixes_1 = []
    existing_suffixes_2 = []
    for code in existentes:
        suf = code[
            len(prefix) :
        ].upper()  # Asegurar que los sufijos estén en mayúsculas
        if len(suf) == 1:
            existing_suffixes_1.append(suf)
        elif len(suf) == 2:
            existing_suffixes_2.append(suf)

    order_1 = [str(i) for i in range(1, 10)] + [
        chr(c) for c in range(ord("A"), ord("Z") + 1)
    ]
    used_1 = set(
        s.upper() for s in existing_suffixes_1
    )  # Asegurar mayúsculas en el set
    allow_two = False
    suffix_suggestion = None

    # Debug: Log para verificar el estado
    print(f"🔍 CJ Debug - Prefix: {prefix}")
    print(f"🔍 CJ Debug - Existing suffixes 1: {existing_suffixes_1}")
    print(f"🔍 CJ Debug - Used 1: {used_1}")
    print(f"🔍 CJ Debug - Order 1: {order_1}")

    # Busca un slot libre de 1 caracter
    for token in order_1:
        if token.upper() not in used_1:  # Comparar en mayúsculas
            suffix_suggestion = token
            print(f"🔍 CJ Debug - Found free token: {token}")
            break
    if suffix_suggestion is None:
        # ya se ocuparon todos -> pasar a 2 letras
        print(f"🔍 CJ Debug - No free 1-char suffix found, switching to 2-char")
        allow_two = True
        # Generar secuencia AA, AB, ... ZZ (26*26)
        used_2 = set(
            s.upper() for s in existing_suffixes_2
        )  # Asegurar mayúsculas en el set
        found = None
        for a in range(ord("A"), ord("Z") + 1):
            for b in range(ord("A"), ord("Z") + 1):
                cand = f"{chr(a)}{chr(b)}"
                if cand not in used_2:
                    found = cand
                    break
            if found:
                break
        suffix_suggestion = found or "AA"  # fallback
        print(f"🔍 CJ Debug - 2-char suggestion: {suffix_suggestion}")
    else:
        print(f"🔍 CJ Debug - 1-char suggestion: {suffix_suggestion}")

    suggestion = prefix + (suffix_suggestion or "")
    print(f"🔍 CJ Debug - Final suggestion: {suggestion}")

    return Response(
        {
            "prefix": prefix,
            "suggestion": suggestion,
            "suffix_suggestion": suffix_suggestion,
            "allow_two": allow_two,
            "existing_suffixes_1": existing_suffixes_1,
            "existing_suffixes_2": existing_suffixes_2,
            "existing_codes": existentes,
        }
    )


# ----------------- helpers -----------------


def _img_meta_from_upload(file, label=None, subdir="media/uploads/placas"):
    rel = guardar_archivo(file, subdir=subdir)
    return {
        "id": uuid.uuid4().hex,
        "name": getattr(file, "name", os.path.basename(rel)),
        "label": label or "",
        "url": rel,
        "size": getattr(file, "size", None),
        "uploaded_at": datetime.utcnow().isoformat(),
    }


def _placa_meta_from_upload(file, label=None):
    return _img_meta_from_upload(file, label=label, subdir="media/uploads/placas")


def _paramimg_meta_from_upload(file, nota=None):
    # usamos key "nota" en lugar de "label" para distinguir el uso
    meta = _img_meta_from_upload(file, label=None, subdir="media/uploads/param_imgs")
    meta["nota"] = nota or ""
    return meta


def _sanitize_imgs_meta(value):
    """
    Normaliza lista de dicts con {id, name, url, label/nota?, size, uploaded_at}.
    Convierte URLs absolutas a relativas.
    """
    items = _parse_json(value, [])
    out = []
    for it in items or []:
        if not isinstance(it, dict):
            continue
        url = (it.get("url") or "").strip()
        if url.startswith("http://") or url.startswith("https://"):
            try:
                url = "/" + url.split("://", 1)[1].split("/", 1)[1]
            except Exception:
                pass
        out.append(
            {
                "id": it.get("id") or uuid.uuid4().hex,
                "name": it.get("name") or (url.split("/")[-1] if url else ""),
                "url": url.lstrip("/"),
                "size": it.get("size"),
                "uploaded_at": it.get("uploaded_at") or datetime.utcnow().isoformat(),
                # preserva campos opcionales si llegan
                "label": it.get("label", ""),
                "nota": it.get("nota", ""),
            }
        )
    return out


def _sanitize_paramimgs(value):
    """
    Normaliza el dict { "<parametro_id>": [<metas>], ... }.
    """
    data = _parse_json(value, {}) or {}
    out = {}
    for k, arr in data.items():
        try:
            pid = str(int(k))  # normaliza key como str de entero
        except Exception:
            # ignora keys inválidas
            continue
        out[pid] = _sanitize_imgs_meta(arr)
    return out


def _abs_imgs(items, request):
    out = []
    for d in items or []:
        dd = dict(d)
        dd["url"] = _absurl(request, dd.get("url", ""))
        out.append(dd)
    return out


def _abs_paramimgs(d, request):
    out = {}
    for pid, arr in (d or {}).items():
        out[str(pid)] = _abs_imgs(arr, request)
    return out


def _absurl(request, path_or_url: str) -> str:
    """Convierte una ruta relativa en URL absoluta; si ya es absoluta, la devuelve tal cual."""
    if not path_or_url:
        return ""
    s = str(path_or_url)
    if s.startswith("http://") or s.startswith("https://"):
        return s
    return request.build_absolute_uri("/" + s.lstrip("/"))


def _as_int_or_none(v):
    try:
        if v is None or v == "":
            return None
        return int(v)
    except Exception:
        return None


def _parse_json(value, default):
    """Acepta dict/list o string JSON; ante error devuelve default."""
    if value is None:
        return default
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except Exception:
        return default


def guardar_archivo(file, subdir="media/uploads"):
    """
    Guarda cualquier archivo bajo <BASE_DIR>/<subdir>/ y devuelve
    la ruta relativa 'subdir/filename.ext' (para exponerla como /media/...).
    """
    ext = os.path.splitext(file.name)[1]
    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    filename = f"{slugify(os.path.splitext(file.name)[0])}_{ts}{ext}"

    # Ruta relativa que guardarás en DB (ej: 'media/uploads/buque_docs/xyz.png')
    relative_path = os.path.join(subdir, filename).replace("\\", "/")

    # Ruta absoluta en disco
    full_path = os.path.join(settings.BASE_DIR, relative_path)

    # 🔴 IMPORTANTE: crear directorio si no existe
    os.makedirs(os.path.dirname(full_path), exist_ok=True)

    # Escribe el archivo (sin default_storage para evitar rarezas con rutas absolutas)
    with open(full_path, "wb+") as dest:
        for chunk in file.chunks():
            dest.write(chunk)

    return relative_path


def _delete_file_safely(old_path: str):
    """Elimina un archivo antiguo si existe y está dentro de la carpeta media/uploads.
    No lanza excepción si falla. old_path es la ruta relativa guardada en DB (ej: media/uploads/avatars/xxx.png).
    """
    if not old_path:
        return
    try:
        # Normaliza y evita borrar fuera de media
        norm = old_path.replace("..", "").lstrip("/\\")
        # Solo permitimos borrar si empieza por 'media/uploads/'
        if not norm.startswith("media/uploads/"):
            return
        full_path = os.path.join(settings.BASE_DIR, norm)
        if os.path.isfile(full_path):
            os.remove(full_path)
    except Exception:
        pass


def _doc_meta_from_upload(f, tipo: str):
    """Crea metadatos de documento para JSONB a partir de un archivo subido."""
    rel = guardar_archivo(f, subdir="media/uploads/buque_docs")
    return {
        "id": uuid.uuid4().hex,  # id lógico del documento
        "name": f.name,
        "type": tipo or "Otro",
        "url": rel,  # guardamos relativo; se expone absoluto en respuesta
        "size": getattr(f, "size", None),
        "uploaded_at": datetime.utcnow().isoformat(),
    }


def _sanitize_docs_meta(value):
    """
    Asegura que la lista meta ingresada por el cliente tenga solo campos válidos
    y URLs relativas (si envían absolutas).
    """
    items = _parse_json(value, [])
    out = []
    for itm in items or []:
        if not isinstance(itm, dict):
            continue
        url = itm.get("url") or ""
        # si llega absoluta, vuelve relativa guardando solo el path
        if url.startswith("http://") or url.startswith("https://"):
            try:
                # parte después del dominio
                url = "/" + url.split("://", 1)[1].split("/", 1)[1]
            except Exception:
                pass
        out.append(
            {
                "id": itm.get("id") or uuid.uuid4().hex,
                "name": itm.get("name") or (url.split("/")[-1] if url else ""),
                "type": itm.get("type") or "Otro",
                "url": url.lstrip("/"),
                "size": itm.get("size"),
                "uploaded_at": itm.get("uploaded_at") or datetime.utcnow().isoformat(),
            }
        )
    return out


# ----------------- webhook helpers -----------------
logger = logging.getLogger(__name__)


def send_document_deletion_webhook(equipo_id, equipo_name, deleted_documents):
    """Send webhook notification to n8n when documents are deleted"""
    webhook_url = getattr(settings, "N8N_WEBHOOK_URL", None)
    if not webhook_url:
        logger.warning("No webhook URL configured")
        return {"success": False, "error": "No webhook URL configured"}

    results = []

    # Send individual webhook for each deleted document
    for doc in deleted_documents:
        payload = {
            "event_type": "document_deletion",
            "equipo_id": equipo_id,
            "equipo_name": equipo_name,
            "deleted_document": doc,
            "timestamp": datetime.utcnow().isoformat(),
        }

        try:
            response = requests.post(
                webhook_url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=getattr(settings, "WEBHOOK_TIMEOUT", 100),
            )

            if response.status_code == 200:
                logger.info(
                    f"Deletion webhook sent successfully for document {doc.get('name', 'unknown')} in equipo {equipo_id}"
                )
                results.append(
                    {
                        "success": True,
                        "document": doc.get("name", "unknown"),
                        "response": response.json(),
                    }
                )
            else:
                logger.error(
                    f"Deletion webhook failed with status {response.status_code} for document {doc.get('name', 'unknown')}"
                )
                results.append(
                    {
                        "success": False,
                        "document": doc.get("name", "unknown"),
                        "error": f"HTTP {response.status_code}",
                    }
                )

        except Exception as e:
            logger.error(
                f"Deletion webhook error for document {doc.get('name', 'unknown')}: {str(e)}"
            )
            results.append(
                {
                    "success": False,
                    "document": doc.get("name", "unknown"),
                    "error": str(e),
                }
            )

    # Return summary of all webhook calls
    successful_calls = sum(1 for r in results if r["success"])
    return {
        "success": successful_calls > 0,
        "total_documents": len(deleted_documents),
        "successful_webhooks": successful_calls,
        "failed_webhooks": len(deleted_documents) - successful_calls,
        "details": results,
    }


def send_document_upload_webhook(equipo_id, equipo_name, uploaded_documents):
    """Send webhook notification to n8n when documents are uploaded"""
    webhook_url = getattr(settings, "N8N_UPLOAD_WEBHOOK_URL", None)
    if not webhook_url:
        logger.warning("No upload webhook URL configured")
        return {"success": False, "error": "No upload webhook URL configured"}

    results = []

    # Send individual webhook for each uploaded document
    for doc in uploaded_documents:
        try:
            files = {}
            data = {
                "action": "process_document",
                "timestamp": datetime.now().isoformat(),
                "source": "django-backend",
                "equipo_id": str(equipo_id),
                "equipo_name": equipo_name,
                "document_name": doc["name"],
            }

            # Add the file
            try:
                file_path = os.path.join(settings.BASE_DIR, doc["url"])
                with open(file_path, "rb") as f:
                    files["docs_new"] = (
                        doc["name"],
                        f.read(),
                        "application/octet-stream",
                    )
                    data[f"docs_new_types"] = doc["type"]
            except Exception as e:
                logger.warning(f"Could not read file {doc['url']}: {str(e)}")
                results.append(
                    {
                        "success": False,
                        "document": doc["name"],
                        "error": f"File read error: {str(e)}",
                    }
                )
                continue

            response = requests.post(
                webhook_url,
                files=files,
                data=data,
                timeout=getattr(settings, "WEBHOOK_TIMEOUT", 100),
            )

            if response.status_code == 200:
                logger.info(
                    f"Upload webhook sent successfully for document {doc['name']} in equipo {equipo_id}"
                )
                results.append(
                    {
                        "success": True,
                        "document": doc["name"],
                        "response": response.json(),
                    }
                )
            else:
                logger.error(
                    f"Upload webhook failed with status {response.status_code} for document {doc['name']}"
                )
                results.append(
                    {
                        "success": False,
                        "document": doc["name"],
                        "error": f"HTTP {response.status_code}",
                    }
                )

        except Exception as e:
            logger.error(f"Upload webhook error for document {doc['name']}: {str(e)}")
            results.append({"success": False, "document": doc["name"], "error": str(e)})

    # Return summary of all webhook calls
    successful_calls = sum(1 for r in results if r["success"])
    return {
        "success": successful_calls > 0,
        "total_documents": len(uploaded_documents),
        "successful_webhooks": successful_calls,
        "failed_webhooks": len(uploaded_documents) - successful_calls,
        "details": results,
    }


# 🔹 Helpers
def _as_float_or_none(v):
    try:
        if v is None or v == "":
            return None
        return float(v)
    except Exception:
        return None


def _parse_misiones(payload):
    """
    Acepta string JSON o lista ya parseada.
    Devuelve lista de dicts con claves 'nombre' y 'descripcion'.
    Filtra elementos vacíos.
    """
    if not payload:
        return []
    try:
        data = json.loads(payload) if isinstance(payload, str) else payload
        if not isinstance(data, list):
            return []
        out = []
        for m in data:
            if not isinstance(m, dict):
                continue
            nombre = (m.get("nombre") or "").strip()
            descripcion = (m.get("descripcion") or "").strip()
            if nombre or descripcion:
                out.append({"nombre": nombre, "descripcion": descripcion})
        return out
    except Exception:
        return []


# 🔹 Buques
@api_view(["GET", "POST"])
def api_buques(request):
    if request.method == "GET":
        buques = Buque.objects.all().order_by("-created_at")
        data = []
        for b in buques:
            imagen_url = b.imagen or "media/buque_img/default_buque.png"
            # documentos con URL absoluta
            docs = []
            for d in b.documentos or []:
                doc = dict(d)
                doc["url"] = _absurl(request, doc.get("url", ""))
                docs.append(doc)

            data.append(
                {
                    "id": b.id,
                    "nombre": b.nombre,
                    "tipo": b.tipo,
                    "descripcion": b.descripcion,
                    "autonomia_horas": b.autonomia_horas,
                    "vida_diseno_anios": b.vida_diseno_anios,
                    "horas_navegacion_anio": b.horas_navegacion_anio,
                    "etapa": b.etapa,
                    "imagen": _absurl(request, imagen_url),
                    "rondas_config": b.rondas_config or {},
                    "documentos": docs,
                    "ficha_tecnica": {
                        "vel_maxima_nudos": b.vel_maxima_nudos,
                        "autonomia_dias": b.autonomia_dias,
                        "alcance_nm_a_12kn": b.alcance_nm_a_12kn,
                        "eslora_total_m": b.eslora_total_m,
                        "manga_moldeada_m": b.manga_moldeada_m,
                        "puntal_m": b.puntal_m,
                        "calado_diseno_m": b.calado_diseno_m,
                        "desplazamiento_ton": b.desplazamiento_ton,
                        "combustible_diario_m3": b.combustible_diario_m3,
                        "combustible_diesel_m3": b.combustible_diesel_m3,
                        "combustible_helicoptero_m3": b.combustible_helicoptero_m3,
                        "gasolina_botes_m3": b.gasolina_botes_m3,
                        "agua_potable_m3": b.agua_potable_m3,
                        "aceite_lubricante_m3": b.aceite_lubricante_m3,
                        "aceite_hidraulico_m3": b.aceite_hidraulico_m3,
                    },
                    "misiones": b.misiones or [],  # 👈 NUEVO
                    "grupos_constructivos": b.grupos_constructivos or [],  # 👈 NUEVO
                    "contexto_operacional": b.contexto_operacional,
                    "created_at": b.created_at,
                    "updated_at": b.updated_at,
                }
            )
        return Response(data)

    # ---------- POST (crear) ----------
    data = request.data

    # imagen del hero
    img = request.FILES.get("imagen")
    img_path = guardar_imagen(img) if img else None

    # config de rondas (puede venir como JSON string o dict)
    rcfg = _parse_json(
        data.get("rondas_config"),
        {
            "intervalo": 1,
            "unidad": "hora",
            "max_duracion_min": 15,
            "ventana_inicio": "00:00",
            "ventana_fin": "23:59",
            "dias_activos": ["L", "M", "X", "J", "V", "S", "D"],
        },
    )

    # metadatos existentes opcionales (normalmente vacío en creación)
    documentos_meta = _sanitize_docs_meta(data.get("documentos"))

    # nuevos docs subidos al crear
    nuevos_docs = []
    files = request.FILES.getlist("docs_new")
    types = data.getlist("docs_new_types") if hasattr(data, "getlist") else []

    for i, f in enumerate(files):
        tipo = (types[i] if i < len(types) else "Otro") or "Otro"
        nuevos_docs.append(_doc_meta_from_upload(f, tipo))

    # misiones (puede llegar como string JSON o lista)
    misiones_payload = data.get("misiones") or request.POST.get("misiones")
    misiones_list = _parse_misiones(misiones_payload)

    # grupos constructivos (puede llegar como string JSON o lista)
    grupos_payload = data.get("grupos_constructivos")
    grupos_list = _parse_json(grupos_payload, [])

    b = Buque.objects.create(
        nombre=data.get("nombre", ""),
        tipo=data.get("tipo", ""),
        descripcion=data.get("descripcion", ""),
        autonomia_horas=_as_int_or_none(data.get("autonomia_horas")),
        vida_diseno_anios=_as_int_or_none(data.get("vida_diseno_anios")),
        horas_navegacion_anio=_as_int_or_none(data.get("horas_navegacion_anio")),
        etapa=data.get("etapa") or "Activo",
        imagen=img_path,
        rondas_config=rcfg,
        documentos=[*documentos_meta, *nuevos_docs],
        # Ficha técnica (blindado contra cadenas vacías)
        vel_maxima_nudos=_as_float_or_none(data.get("vel_maxima_nudos")),
        autonomia_dias=_as_float_or_none(data.get("autonomia_dias")),
        alcance_nm_a_12kn=_as_float_or_none(data.get("alcance_nm_a_12kn")),
        eslora_total_m=_as_float_or_none(data.get("eslora_total_m")),
        manga_moldeada_m=_as_float_or_none(data.get("manga_moldeada_m")),
        puntal_m=_as_float_or_none(data.get("puntal_m")),
        calado_diseno_m=_as_float_or_none(data.get("calado_diseno_m")),
        desplazamiento_ton=_as_float_or_none(data.get("desplazamiento_ton")),
        combustible_diario_m3=_as_float_or_none(data.get("combustible_diario_m3")),
        combustible_diesel_m3=_as_float_or_none(data.get("combustible_diesel_m3")),
        combustible_helicoptero_m3=_as_float_or_none(
            data.get("combustible_helicoptero_m3")
        ),
        gasolina_botes_m3=_as_float_or_none(data.get("gasolina_botes_m3")),
        agua_potable_m3=_as_float_or_none(data.get("agua_potable_m3")),
        aceite_lubricante_m3=_as_float_or_none(data.get("aceite_lubricante_m3")),
        aceite_hidraulico_m3=_as_float_or_none(data.get("aceite_hidraulico_m3")),
        # Misiones
        misiones=misiones_list,
        # Grupos constructivos
        grupos_constructivos=grupos_list,
        # Contexto operacional
        contexto_operacional=_parse_json(data.get("contexto_operacional"), {}),
    )

    imagen_url = b.imagen or "media/buque_img/default_buque.png"
    resp_docs = []
    for d in b.documentos or []:
        dd = dict(d)
        dd["url"] = _absurl(request, dd.get("url", ""))
        resp_docs.append(dd)

    return Response(
        {
            "id": b.id,
            "nombre": b.nombre,
            "tipo": b.tipo,
            "descripcion": b.descripcion,
            "autonomia_horas": b.autonomia_horas,
            "vida_diseno_anios": b.vida_diseno_anios,
            "horas_navegacion_anio": b.horas_navegacion_anio,
            "etapa": b.etapa,
            "imagen": _absurl(request, imagen_url),
            "rondas_config": b.rondas_config or {},
            "documentos": resp_docs,
            "ficha_tecnica": {
                "vel_maxima_nudos": b.vel_maxima_nudos,
                "autonomia_dias": b.autonomia_dias,
                "alcance_nm_a_12kn": b.alcance_nm_a_12kn,
                "eslora_total_m": b.eslora_total_m,
                "manga_moldeada_m": b.manga_moldeada_m,
                "puntal_m": b.puntal_m,
                "calado_diseno_m": b.calado_diseno_m,
                "desplazamiento_ton": b.desplazamiento_ton,
                "combustible_diario_m3": b.combustible_diario_m3,
                "combustible_diesel_m3": b.combustible_diesel_m3,
                "combustible_helicoptero_m3": b.combustible_helicoptero_m3,
                "gasolina_botes_m3": b.gasolina_botes_m3,
                "agua_potable_m3": b.agua_potable_m3,
                "aceite_lubricante_m3": b.aceite_lubricante_m3,
                "aceite_hidraulico_m3": b.aceite_hidraulico_m3,
            },
            "misiones": b.misiones or [],  # 👈 NUEVO
            "grupos_constructivos": b.grupos_constructivos or [],  # 👈 NUEVO
            "contexto_operacional": b.contexto_operacional,
            "created_at": b.created_at,
            "updated_at": b.updated_at,
        },
        status=201,
    )


@api_view(["GET", "PUT"])
def api_buque(request, buque_id):
    buque = get_object_or_404(Buque, id=buque_id)

    if request.method == "GET":
        imagen_url = buque.imagen or "media/buque_img/default_buque.png"
        docs = []
        for d in buque.documentos or []:
            doc = dict(d)
            doc["url"] = _absurl(request, doc.get("url", ""))
            docs.append(doc)
        return Response(
            {
                "id": buque.id,
                "nombre": buque.nombre,
                "tipo": buque.tipo,
                "descripcion": buque.descripcion,
                "autonomia_horas": buque.autonomia_horas,
                "vida_diseno_anios": buque.vida_diseno_anios,
                "horas_navegacion_anio": buque.horas_navegacion_anio,
                "etapa": buque.etapa,
                "imagen": _absurl(request, imagen_url),
                "rondas_config": buque.rondas_config or {},
                "documentos": docs,
                "ficha_tecnica": {
                    "vel_maxima_nudos": buque.vel_maxima_nudos,
                    "autonomia_dias": buque.autonomia_dias,
                    "alcance_nm_a_12kn": buque.alcance_nm_a_12kn,
                    "eslora_total_m": buque.eslora_total_m,
                    "manga_moldeada_m": buque.manga_moldeada_m,
                    "puntal_m": buque.puntal_m,
                    "calado_diseno_m": buque.calado_diseno_m,
                    "desplazamiento_ton": buque.desplazamiento_ton,
                    "combustible_diario_m3": buque.combustible_diario_m3,
                    "combustible_diesel_m3": buque.combustible_diesel_m3,
                    "combustible_helicoptero_m3": buque.combustible_helicoptero_m3,
                    "gasolina_botes_m3": buque.gasolina_botes_m3,
                    "agua_potable_m3": buque.agua_potable_m3,
                    "aceite_lubricante_m3": buque.aceite_lubricante_m3,
                    "aceite_hidraulico_m3": buque.aceite_hidraulico_m3,
                },
                "misiones": buque.misiones or [],  # 👈 NUEVO
                "grupos_constructivos": buque.grupos_constructivos or [],  # 👈 NUEVO
                "contexto_operacional": buque.contexto_operacional,
                "created_at": buque.created_at,
                "updated_at": buque.updated_at,
            }
        )

    # ---------- PUT (editar) ----------
    data = request.data
    img = request.FILES.get("imagen")

    buque.nombre = data.get("nombre", buque.nombre)
    buque.tipo = data.get("tipo", buque.tipo)
    buque.descripcion = data.get("descripcion", buque.descripcion)
    buque.autonomia_horas = _as_int_or_none(data.get("autonomia_horas"))
    buque.vida_diseno_anios = _as_int_or_none(data.get("vida_diseno_anios"))
    buque.horas_navegacion_anio = _as_int_or_none(data.get("horas_navegacion_anio"))
    buque.etapa = data.get("etapa", buque.etapa)

    # rondas_config entrante (si no viene, conserva el actual)
    if "rondas_config" in data:
        buque.rondas_config = _parse_json(
            data.get("rondas_config"), buque.rondas_config or {}
        )

    # documentos existentes (con tipos actualizados) si llega 'documentos'
    if "documentos" in data:
        buque.documentos = _sanitize_docs_meta(data.get("documentos"))

    # agregar nuevos documentos (docs_new[])
    new_files = request.FILES.getlist("docs_new")
    new_types = data.getlist("docs_new_types") if hasattr(data, "getlist") else []
    if new_files:
        metas = []
        for i, f in enumerate(new_files):
            tipo = (new_types[i] if i < len(new_types) else "Otro") or "Otro"
            metas.append(_doc_meta_from_upload(f, tipo))
        buque.documentos = (buque.documentos or []) + metas

    # eliminar por ids (opcional): docs_remove_ids=["id1","id2"]
    if "docs_remove_ids" in data:
        ids = set(_parse_json(data.get("docs_remove_ids"), []))
        # Determinar archivos a eliminar físicamente
        _docs_to_delete = [d for d in (buque.documentos or []) if d.get("id") in ids]
        # Depurar metadata
        buque.documentos = [
            d for d in (buque.documentos or []) if d.get("id") not in ids
        ]
        # Borrar archivos físicos de manera segura
        for _d in _docs_to_delete:
            try:
                _delete_file_safely(_d.get("url"))
            except Exception:
                pass
    if img:
        buque.imagen = guardar_imagen(img)

    # Actualizar ficha técnica (solo si viene; con parse a float/None)
    if "vel_maxima_nudos" in data:
        buque.vel_maxima_nudos = _as_float_or_none(data.get("vel_maxima_nudos"))
    if "autonomia_dias" in data:
        buque.autonomia_dias = _as_float_or_none(data.get("autonomia_dias"))
    if "alcance_nm_a_12kn" in data:
        buque.alcance_nm_a_12kn = _as_float_or_none(data.get("alcance_nm_a_12kn"))
    if "eslora_total_m" in data:
        buque.eslora_total_m = _as_float_or_none(data.get("eslora_total_m"))
    if "manga_moldeada_m" in data:
        buque.manga_moldeada_m = _as_float_or_none(data.get("manga_moldeada_m"))
    if "puntal_m" in data:
        buque.puntal_m = _as_float_or_none(data.get("puntal_m"))
    if "calado_diseno_m" in data:
        buque.calado_diseno_m = _as_float_or_none(data.get("calado_diseno_m"))
    if "desplazamiento_ton" in data:
        buque.desplazamiento_ton = _as_float_or_none(data.get("desplazamiento_ton"))
    if "combustible_diario_m3" in data:
        buque.combustible_diario_m3 = _as_float_or_none(
            data.get("combustible_diario_m3")
        )
    if "combustible_diesel_m3" in data:
        buque.combustible_diesel_m3 = _as_float_or_none(
            data.get("combustible_diesel_m3")
        )
    if "combustible_helicoptero_m3" in data:
        buque.combustible_helicoptero_m3 = _as_float_or_none(
            data.get("combustible_helicoptero_m3")
        )
    if "gasolina_botes_m3" in data:
        buque.gasolina_botes_m3 = _as_float_or_none(data.get("gasolina_botes_m3"))
    if "agua_potable_m3" in data:
        buque.agua_potable_m3 = _as_float_or_none(data.get("agua_potable_m3"))
    if "aceite_lubricante_m3" in data:
        buque.aceite_lubricante_m3 = _as_float_or_none(data.get("aceite_lubricante_m3"))
    if "aceite_hidraulico_m3" in data:
        buque.aceite_hidraulico_m3 = _as_float_or_none(data.get("aceite_hidraulico_m3"))

    # Misiones (si llegan, reemplazo total simple)
    if "misiones" in data:
        buque.misiones = _parse_misiones(data.get("misiones"))

    # Grupos constructivos (si llegan, reemplazo total simple)
    if "grupos_constructivos" in data:
        buque.grupos_constructivos = _parse_json(data.get("grupos_constructivos"), [])

    # Actualizar contexto operacional
    if "contexto_operacional" in data:
        buque.contexto_operacional = _parse_json(
            data.get("contexto_operacional"), buque.contexto_operacional or {}
        )

    buque.save()

    imagen_url = buque.imagen or "media/buque_img/default_buque.png"
    resp_docs = []
    for d in buque.documentos or []:
        dd = dict(d)
        dd["url"] = _absurl(request, dd.get("url", ""))
        resp_docs.append(dd)

    return Response(
        {
            "id": buque.id,
            "nombre": buque.nombre,
            "tipo": buque.tipo,
            "descripcion": buque.descripcion,
            "autonomia_horas": buque.autonomia_horas,
            "vida_diseno_anios": buque.vida_diseno_anios,
            "horas_navegacion_anio": buque.horas_navegacion_anio,
            "etapa": buque.etapa,
            "imagen": _absurl(request, imagen_url),
            "rondas_config": buque.rondas_config or {},
            "documentos": resp_docs,
            "ficha_tecnica": {
                "vel_maxima_nudos": buque.vel_maxima_nudos,
                "autonomia_dias": buque.autonomia_dias,
                "alcance_nm_a_12kn": buque.alcance_nm_a_12kn,
                "eslora_total_m": buque.eslora_total_m,
                "manga_moldeada_m": buque.manga_moldeada_m,
                "puntal_m": buque.puntal_m,
                "calado_diseno_m": buque.calado_diseno_m,
                "desplazamiento_ton": buque.desplazamiento_ton,
                "combustible_diario_m3": buque.combustible_diario_m3,
                "combustible_diesel_m3": buque.combustible_diesel_m3,
                "combustible_helicoptero_m3": buque.combustible_helicoptero_m3,
                "gasolina_botes_m3": buque.gasolina_botes_m3,
                "agua_potable_m3": buque.agua_potable_m3,
                "aceite_lubricante_m3": buque.aceite_lubricante_m3,
                "aceite_hidraulico_m3": buque.aceite_hidraulico_m3,
            },
            "misiones": buque.misiones or [],  # 👈 NUEVO
            "contexto_operacional": buque.contexto_operacional,
            "created_at": buque.created_at,
            "updated_at": buque.updated_at,
        },
        status=200,
    )


# Nuevo endpoint: solo nombre del buque por ID
@api_view(["GET"])
def api_buque_nombre(request, buque_id):
    buque = Buque.objects.filter(id=buque_id).first()
    if not buque:
        return Response({"error": "Buque no encontrado"}, status=404)
    return Response({"id": buque.id, "nombre": buque.nombre})


# 🔹 Equipos por Buque
@api_view(["GET"])
def api_equipos_por_buque(request):
    buque_id = request.GET.get("buque_id")

    if not buque_id:
        return Response({"error": "Falta el parámetro buque_id"}, status=400)

    equipos = Equipo.objects.filter(buque_id=buque_id).select_related(
        "grupo", "subgrupo", "sistema", "subsistema"
    )

    data = []
    for equipo in equipos:
        data.append(
            {
                "id": equipo.id,
                "nombre_equipo": equipo.nombre_equipo,
                "codigo_cj": equipo.codigo_cj,  # Agregar el código CJ del equipo
                "grupo_numero_de_referencia": equipo.grupo.numero_de_referencia,  # Agregar el número de referencia del grupo
                "grupo_descripcion": equipo.grupo.descripcion,
                "subgrupo_descripcion": equipo.subgrupo.descripcion,
                "sistema_descripcion": (
                    equipo.sistema.descripcion if equipo.sistema else None
                ),
                "subsistema_descripcion": (
                    equipo.subsistema.descripcion if equipo.subsistema else None
                ),
                "imagen": equipo.imagen,
                "grupo_id": equipo.grupo.id,
                "subgrupo_id": equipo.subgrupo.id,
                "sistema_id": equipo.sistema.id if equipo.sistema else None,
                "subsistema_id": equipo.subsistema.id if equipo.subsistema else None,
            }
        )

    return Response(data)


# 🔹 Parámetros CRUD
@api_view(["GET"])
def obtener_parametros(request):
    parametros = list(
        Parametro.objects.values(
            "id", "nombre", "unidad", "valor_maximo", "valor_minimo", "created_at"
        )
    )
    return Response(parametros)


@api_view(["POST"])
def agregar_parametro(request):
    data = request.data
    parametro = Parametro.objects.create(
        nombre=data["nombre"],
        unidad=data["unidad"],
        valor_maximo=data["valor_maximo"],
        valor_minimo=data["valor_minimo"],
    )
    return Response({"id": parametro.id}, status=201)


@api_view(["GET"])
def obtener_unidades_parametros(request):
    """
    Devuelve la lista de unidades distintas disponibles en los parámetros existentes.
    Respuesta: ["BAR", "PSI", "°C", ...]
    """
    unidades = (
        Parametro.objects.exclude(unidad__isnull=True)
        .exclude(unidad__exact="")
        .values_list("unidad", flat=True)
        .distinct()
        .order_by("unidad")
    )
    return Response(list(unidades), status=200)


@api_view(["POST"])
def actualizar_parametro(request, id):
    parametro = get_object_or_404(Parametro, id=id)
    data = request.data
    parametro.nombre = data["nombre"]
    parametro.unidad = data["unidad"]
    parametro.valor_maximo = data["valor_maximo"]
    parametro.valor_minimo = data["valor_minimo"]
    parametro.save()
    return Response(status=200)


@api_view(["DELETE"])
def eliminar_parametro(request, id):
    parametro = get_object_or_404(Parametro, id=id)
    parametro.delete()
    return Response(status=204)


# 🔹 Equipos CRUD básico
@api_view(["POST"])
def crear_equipo(request):
    data = request.data
    imagen = request.FILES.get("imagen")

    # 1) Documentos
    documentos_meta = _sanitize_docs_meta(data.get("documentos"))
    nuevos_docs = []
    files = request.FILES.getlist("docs_new")
    types = data.getlist("docs_new_types") if hasattr(data, "getlist") else []
    for i, f in enumerate(files or []):
        tipo = (types[i] if i < len(types) else "Otro") or "Otro"
        nuevos_docs.append(_doc_meta_from_upload_equipo(f, tipo))

    # 2) PLACAS
    placas_meta = _sanitize_imgs_meta(data.get("placas"))
    placas_files = request.FILES.getlist("placas_new")
    placas_labels = (
        data.getlist("placas_new_labels") if hasattr(data, "getlist") else []
    )
    for i, f in enumerate(placas_files or []):
        label = placas_labels[i] if i < len(placas_labels) else ""
        placas_meta.append(_placa_meta_from_upload(f, label))

    # 3) PARAMETROS_IMAGENES
    paramimgs_meta = _sanitize_paramimgs(data.get("parametros_imagenes"))  # dict
    # campos dinámicos: paramimgs_new__<parametro_id>[]
    for key in list(request.FILES.keys()):
        if key.startswith("paramimgs_new__"):
            pid_str = key.split("__", 1)[1]
            try:
                int(pid_str)
            except Exception:
                continue
            files = request.FILES.getlist(key)
            notas = (
                data.getlist(f"paramimgs_new_notas__{pid_str}")
                if hasattr(data, "getlist")
                else []
            )
            metas = []
            for i, f in enumerate(files or []):
                nota = notas[i] if i < len(notas) else ""
                metas.append(_paramimg_meta_from_upload(f, nota))
            paramimgs_meta[pid_str] = (paramimgs_meta.get(pid_str) or []) + metas

    # Validación opcional de codigo_cj si llega
    codigo_cj = data.get("codigo_cj") or data.get("cj") or None
    if codigo_cj:
        # Verifica unicidad por buque+subsistema+codigo_cj
        if Equipo.objects.filter(
            buque_id=data.get("buque_id") or None,
            subsistema_id=data.get("subsistema_id") or None,
            codigo_cj=codigo_cj,
        ).exists():
            return Response(
                {"error": "codigo_cj duplicado para ese subsistema y buque"}, status=400
            )

    equipo = Equipo.objects.create(
        grupo_id=data["grupo_id"],
        subgrupo_id=data["subgrupo_id"],
        sistema_id=data.get("sistema_id") or None,
        subsistema_id=data.get("subsistema_id") or None,
        nombre_equipo=data["nombre_equipo"],
        parametros=data.get("parametros", "{}"),
        imagen=guardar_imagen_equipo(imagen) if imagen else None,
        buque_id=data.get("buque_id") or None,
        descripcion=data.get("descripcion", ""),
        marca=data.get("marca", ""),
        modelo=data.get("modelo", ""),
        serial=data.get("serial", ""),
        codigo_cj=codigo_cj,
        documentos=[*documentos_meta, *nuevos_docs],
        placas=placas_meta,
        parametros_imagenes=paramimgs_meta,
    )
    return Response({"id": equipo.id}, status=201)


# views.py — REEMPLAZAR SOLO ESTA VISTA COMPLETA


@api_view(["GET", "PUT", "DELETE"])
def equipo_detail(request, equipo_id):
    """
    GET:  Devuelve un JSON plano con IDs de cascada (grupo/subgrupo/sistema/subsistema/buque),
          además de metas normalizadas para imagen principal, placas, documentos e imágenes por parámetro.
    PUT:  Actualiza campos, maneja imagen, documentos, placas e imágenes por parámetro (altas/bajas/reemplazo).
    DELETE: Elimina el equipo.
    """
    equipo = get_object_or_404(Equipo, id=equipo_id)

    # ------------------------- GET -------------------------
    if request.method == "GET":
        return Response(
            {
                "id": equipo.id,
                "grupo_id": equipo.grupo_id,
                "subgrupo_id": equipo.subgrupo_id,
                "sistema_id": equipo.sistema_id,
                "subsistema_id": equipo.subsistema_id,
                "buque_id": equipo.buque_id,
                "nombre_equipo": equipo.nombre_equipo,
                "parametros": equipo.parametros,
                "imagen": equipo.imagen,  # ruta/URL (tu helper front hace normalize)
                "descripcion": equipo.descripcion,
                "marca": equipo.marca,
                "modelo": equipo.modelo,
                "serial": equipo.serial,
                "codigo_cj": equipo.codigo_cj,  # Código CJ
                "numero_equipo_sap": equipo.numero_equipo_sap,  # Número SAP
                "contador": equipo.contador,  # Contador
                # Metas normalizadas para el front:
                "documentos": _abs_docs(equipo.documentos, request),
                "placas": _abs_imgs(equipo.placas, request),
                "parametros_imagenes": _abs_paramimgs(
                    equipo.parametros_imagenes, request
                ),
            }
        )

    # ------------------------- PUT (editar) -------------------------
    if request.method == "PUT":
        data = request.data
        imagen = request.FILES.get("imagen")

        # IDs de cascada (acepta string o int)
        equipo.grupo_id = data.get("grupo_id") or None
        equipo.subgrupo_id = data.get("subgrupo_id") or None
        equipo.sistema_id = data.get("sistema_id") or None
        equipo.subsistema_id = data.get("subsistema_id") or None

        # Otros campos
        equipo.buque_id = data.get("buque_id") or equipo.buque_id
        equipo.nombre_equipo = data.get("nombre_equipo", equipo.nombre_equipo)
        equipo.parametros = data.get("parametros", equipo.parametros) or "{}"
        # codigo_cj (validación unicidad)
        if "codigo_cj" in data or "cj" in data:
            nuevo_cj = data.get("codigo_cj") or data.get("cj") or None
            if nuevo_cj and nuevo_cj != equipo.codigo_cj:
                if (
                    Equipo.objects.filter(
                        buque_id=equipo.buque_id,
                        subsistema_id=equipo.subsistema_id,
                        codigo_cj=nuevo_cj,
                    )
                    .exclude(id=equipo.id)
                    .exists()
                ):
                    return Response(
                        {"error": "codigo_cj duplicado para ese subsistema y buque"},
                        status=400,
                    )
            equipo.codigo_cj = nuevo_cj

        # Campos SWBS
        equipo.descripcion = data.get("descripcion", equipo.descripcion or "")
        equipo.marca = data.get("marca", equipo.marca or "")
        equipo.modelo = data.get("modelo", equipo.modelo or "")
        equipo.serial = data.get("serial", equipo.serial or "")
        equipo.numero_equipo_sap = data.get("numero_equipo_sap", equipo.numero_equipo_sap or "")
        
        # Contador: permitir None, 0 o valores numéricos
        if "contador" in data:
            contador_val = data.get("contador")
            if contador_val == '' or contador_val is None:
                equipo.contador = None
            else:
                try:
                    equipo.contador = int(contador_val)
                except (ValueError, TypeError):
                    equipo.contador = None

        # Imagen principal (opcional)
        if imagen:
            equipo.imagen = guardar_imagen_equipo(imagen)

        # ====== DOCUMENTOS ======
        # (a) Reemplazo total si llega 'documentos' (JSON string o lista)
        if "documentos" in data:
            equipo.documentos = _sanitize_docs_meta(data.get("documentos"))

        # (b) Altas (docs_new[] + docs_new_types[])
        new_docs = request.FILES.getlist("docs_new")
        new_types = data.getlist("docs_new_types") if hasattr(data, "getlist") else []
        if new_docs:
            metas = []
            for i, f in enumerate(new_docs):
                tipo = (new_types[i] if i < len(new_types) else "Otro") or "Otro"
                metas.append(_doc_meta_from_upload_equipo(f, tipo))
            equipo.documentos = (equipo.documentos or []) + metas

        # (c) Bajas por IDs (docs_remove_ids=["id1","id2"]) + borrar archivos físicos
        if "docs_remove_ids" in data:
            ids_rm = set(_parse_json(data.get("docs_remove_ids"), []))
            # Archivos a eliminar físicamente
            _docs_to_delete = [d for d in (equipo.documentos or []) if d.get("id") in ids_rm]
            # Depurar metadata
            equipo.documentos = [
                d for d in (equipo.documentos or []) if d.get("id") not in ids_rm
            ]
            # Borrar archivos físicos de manera segura
            for _d in _docs_to_delete:
                try:
                    _delete_file_safely(_d.get("url"))
                except Exception:
                    pass

        # ====== PLACAS ======
        # (a) Reemplazo total
        if "placas" in data:
            equipo.placas = _sanitize_imgs_meta(data.get("placas"))

        # (b) Altas (placas_new[] + placas_new_labels[])
        placas_files = request.FILES.getlist("placas_new")
        placas_labels = (
            data.getlist("placas_new_labels") if hasattr(data, "getlist") else []
        )
        if placas_files:
            metas = []
            for i, f in enumerate(placas_files):
                label = placas_labels[i] if i < len(placas_labels) else ""
                metas.append(_placa_meta_from_upload(f, label))
            equipo.placas = (equipo.placas or []) + metas

        # (c) Bajas por IDs (placas_remove_ids=["id1","id2"]) + borrar archivos físicos
        if "placas_remove_ids" in data:
            ids_rm = set(_parse_json(data.get("placas_remove_ids"), []))
            _placas_to_delete = [d for d in (equipo.placas or []) if d.get("id") in ids_rm]
            equipo.placas = [
                d for d in (equipo.placas or []) if d.get("id") not in ids_rm
            ]
            for _p in _placas_to_delete:
                try:
                    _delete_file_safely(_p.get("url"))
                except Exception:
                    pass

        # ====== PARAMETROS_IMAGENES ======
        # (a) Reemplazo total del dict si llega 'parametros_imagenes'
        if "parametros_imagenes" in data:
            equipo.parametros_imagenes = _sanitize_paramimgs(
                data.get("parametros_imagenes")
            )

        # (b) Altas por parámetro: campos dinámicos paramimgs_new__<parametro_id>[]
        changed = False
        paramimgs = equipo.parametros_imagenes or {}
        for key in list(request.FILES.keys()):
            if key.startswith("paramimgs_new__"):
                pid_str = key.split("__", 1)[1]
                try:
                    int(pid_str)
                except Exception:
                    continue
                files = request.FILES.getlist(key)
                notas = (
                    data.getlist(f"paramimgs_new_notas__{pid_str}")
                    if hasattr(data, "getlist")
                    else []
                )
                metas = []
                for i, f in enumerate(files or []):
                    nota = notas[i] if i < len(notas) else ""
                    metas.append(_paramimg_meta_from_upload(f, nota))
                paramimgs[str(pid_str)] = (paramimgs.get(str(pid_str)) or []) + metas
                changed = True
        if changed:
            equipo.parametros_imagenes = paramimgs

        # (c) Bajas por parámetro: paramimgs_remove_ids__<parametro_id>=["id1","id2"] + borrar archivos físicos
        for key in list(data.keys()):
            if key.startswith("paramimgs_remove_ids__"):
                pid_str = key.split("__", 1)[1]
                try:
                    int(pid_str)
                except Exception:
                    continue
                ids_rm = set(_parse_json(data.get(key), []))
                cur = (equipo.parametros_imagenes or {}).get(str(pid_str), [])
                _imgs_to_delete = [d for d in (cur or []) if d.get("id") in ids_rm]
                equipo.parametros_imagenes[str(pid_str)] = [
                    d for d in (cur or []) if d.get("id") not in ids_rm
                ]
                for _img in _imgs_to_delete:
                    try:
                        _delete_file_safely(_img.get("url"))
                    except Exception:
                        pass

        equipo.save()
        return Response({"id": equipo.id})

    # ------------------------- DELETE -------------------------
    if request.method == "DELETE":
        nombre = getattr(equipo, "nombre_equipo", "")
        eid = equipo.id
        equipo.delete()
        return Response({"deleted": True, "equipo_id": eid, "nombre_equipo": nombre})


@api_view(["POST"])
def equipo_view(request):
    data = request.data

    imagen = request.FILES.get("imagen")
    imagen_path = None
    if imagen:
        imagen_path = default_storage.save(f"media/uploads/{imagen.name}", imagen)

    # Procesar contador
    contador_val = data.get("contador")
    if contador_val == '' or contador_val is None:
        contador = None
    else:
        try:
            contador = int(contador_val)
        except (ValueError, TypeError):
            contador = None

    equipo = Equipo.objects.create(
        grupo_id=data.get("grupo_id"),
        subgrupo_id=data.get("subgrupo_id"),
        sistema_id=data.get("sistema_id") or None,
        subsistema_id=data.get("subsistema_id") or None,
        buque_id=data.get("buque_id") or None,
        nombre_equipo=data.get("nombre_equipo"),
        parametros=data.get("parametros"),
        imagen=imagen_path,
        descripcion=data.get("descripcion", ""),
        marca=data.get("marca", ""),
        modelo=data.get("modelo", ""),
        serial=data.get("serial", ""),
        numero_equipo_sap=data.get("numero_equipo_sap", ""),
        contador=contador,
    )
    return Response({"id": equipo.id}, status=status.HTTP_201_CREATED)


def guardar_imagen(file):
    """Función genérica para guardar imágenes (backwards compatibility)"""
    return guardar_imagen_buque(file)


@csrf_exempt
def eliminar_imagen_equipo(request, equipo_id):
    """Eliminar imagen de un equipo"""
    if request.method == "DELETE":
        try:
            equipo = Equipo.objects.get(id=equipo_id)

            # Eliminar archivo físico si existe
            if equipo.imagen:
                file_path = os.path.join(settings.BASE_DIR, equipo.imagen)
                if os.path.exists(file_path):
                    os.remove(file_path)

            # Limpiar campo de imagen en la base de datos
            equipo.imagen = None
            equipo.save()

            return JsonResponse(
                {"success": True, "message": "Imagen eliminada correctamente"}
            )

        except Equipo.DoesNotExist:
            return JsonResponse(
                {"success": False, "error": "Equipo no encontrado"}, status=404
            )
        except Exception as e:
            return JsonResponse({"success": False, "error": str(e)}, status=500)

    return JsonResponse({"success": False, "error": "Método no permitido"}, status=405)


def guardar_imagen_buque(file):
    """Guardar imagen de buque en media/buque_img/"""
    ext = os.path.splitext(file.name)[1]
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    filename = f"{slugify(os.path.splitext(file.name)[0])}_{timestamp}{ext}"

    relative_path = os.path.join("media", "buque_img", filename).replace("\\", "/")
    full_path = os.path.join(settings.BASE_DIR, relative_path)

    os.makedirs(os.path.dirname(full_path), exist_ok=True)

    with open(full_path, "wb+") as destination:
        for chunk in file.chunks():
            destination.write(chunk)

    return relative_path


def guardar_imagen_equipo(file):
    """Guardar imagen de equipo en media/equipo_img/"""
    ext = os.path.splitext(file.name)[1]
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    filename = f"{slugify(os.path.splitext(file.name)[0])}_{timestamp}{ext}"

    relative_path = os.path.join("media", "equipo_img", filename).replace("\\", "/")
    full_path = os.path.join(settings.BASE_DIR, relative_path)

    os.makedirs(os.path.dirname(full_path), exist_ok=True)

    with open(full_path, "wb+") as destination:
        for chunk in file.chunks():
            destination.write(chunk)

    return relative_path


# =========================
# 🔸 RELACIONES M:N NUEVAS
# =========================


# 1) Obtener parámetros relacionados a un subsistema
@api_view(["GET"])
def subsistema_parametros(request, subsistema_id):
    """
    Devuelve la lista de IDs de parámetros relacionados con el subsistema.
    Respuesta: [1, 2, 3]
    """
    # Valida subsistema
    _ = get_object_or_404(Subsistema, id=subsistema_id)
    ids = list(
        SubsistemaParametro.objects.filter(subsistema_id=subsistema_id).values_list(
            "parametro_id", flat=True
        )
    )
    return Response(ids, status=200)


# 2) Reemplazar parámetros relacionados a un subsistema
@api_view(["POST"])
def subsistema_relacionar_parametros(request, subsistema_id):
    """
    Cuerpo: { "parametros": [1, 2, 3] }
    Sobrescribe la lista completa de parámetros del subsistema dado.
    """
    _ = get_object_or_404(Subsistema, id=subsistema_id)
    ids = request.data.get("parametros", [])

    try:
        ids = [int(x) for x in ids]
    except Exception:
        return Response(
            {"error": "El campo 'parametros' debe ser una lista de IDs numéricos."},
            status=400,
        )

    # Mantén solo IDs válidos
    deseados = set(Parametro.objects.filter(id__in=ids).values_list("id", flat=True))
    actuales = set(
        SubsistemaParametro.objects.filter(subsistema_id=subsistema_id).values_list(
            "parametro_id", flat=True
        )
    )

    a_borrar = actuales - deseados
    a_agregar = deseados - actuales

    if a_borrar:
        SubsistemaParametro.objects.filter(
            subsistema_id=subsistema_id, parametro_id__in=a_borrar
        ).delete()

    if a_agregar:
        objs = [
            SubsistemaParametro(subsistema_id=subsistema_id, parametro_id=pid)
            for pid in a_agregar
        ]
        SubsistemaParametro.objects.bulk_create(objs, ignore_conflicts=True)

    return Response({"parametros": list(deseados)}, status=200)


# 3) Desde un parámetro, fijar en qué subsistemas está
@api_view(["POST"])
def parametro_relacionar_subsistemas(request, parametro_id):
    """
    Cuerpo: { "subsistemas": [10, 11, 12] }
    Reemplaza todos los subsistemas donde está este parámetro.
    """
    _ = get_object_or_404(Parametro, id=parametro_id)
    subsistemas_ids = request.data.get("subsistemas", [])

    try:
        subsistemas_ids = [int(x) for x in subsistemas_ids]
    except Exception:
        return Response(
            {"error": "El campo 'subsistemas' debe ser una lista de IDs numéricos."},
            status=400,
        )

    existentes = set(
        Subsistema.objects.filter(id__in=subsistemas_ids).values_list("id", flat=True)
    )
    actuales = set(
        SubsistemaParametro.objects.filter(parametro_id=parametro_id).values_list(
            "subsistema_id", flat=True
        )
    )

    a_borrar = actuales - existentes
    a_agregar = existentes - actuales

    if a_borrar:
        SubsistemaParametro.objects.filter(
            parametro_id=parametro_id, subsistema_id__in=a_borrar
        ).delete()

    if a_agregar:
        objs = [
            SubsistemaParametro(subsistema_id=sid, parametro_id=parametro_id)
            for sid in a_agregar
        ]
        SubsistemaParametro.objects.bulk_create(objs, ignore_conflicts=True)

    return Response({"subsistemas": list(existentes)}, status=200)


# 4) Parámetros disponibles para un equipo según su subsistema,
#    marcando cuáles están seleccionados en ese equipo
@api_view(["GET"])
def equipo_parametros_disponibles(request, equipo_id):
    equipo = get_object_or_404(Equipo, id=equipo_id)
    if not equipo.subsistema_id:
        return Response(
            {"error": "El equipo no tiene subsistema asociado."}, status=400
        )

    disponibles = list(
        Parametro.objects.filter(
            id__in=SubsistemaParametro.objects.filter(
                subsistema_id=equipo.subsistema_id
            ).values_list("parametro_id", flat=True)
        ).values("id", "nombre", "unidad", "valor_minimo", "valor_maximo")
    )

    seleccionados = set(
        EquipoParametro.objects.filter(equipo_id=equipo_id).values_list(
            "parametro_id", flat=True
        )
    )

    for d in disponibles:
        d["selected"] = d["id"] in seleccionados

    return Response(disponibles, status=200)


# 5) Fijar parámetros seleccionados para un equipo (solo de los permitidos por su subsistema)
@api_view(["POST"])
def equipo_fijar_parametros(request, equipo_id):
    """
    Cuerpo:
    {
      "parametros": [1,2,3],
      "config_por_parametro": { "1": {"umbral": 70}, "3": {"nota": "X"} }  # opcional
    }
    """
    equipo = get_object_or_404(Equipo, id=equipo_id)
    if not equipo.subsistema_id:
        return Response(
            {"error": "El equipo no tiene subsistema asociado."}, status=400
        )

    ids = request.data.get("parametros", [])
    config_map = request.data.get("config_por_parametro", {}) or {}

    try:
        ids = [int(x) for x in ids]
        config_map = {int(k): v for k, v in config_map.items()}
    except Exception:
        return Response({"error": "IDs deben ser enteros"}, status=400)

    permitidos = set(
        SubsistemaParametro.objects.filter(
            subsistema_id=equipo.subsistema_id
        ).values_list("parametro_id", flat=True)
    )
    deseados = (
        set(Parametro.objects.filter(id__in=ids).values_list("id", flat=True))
        & permitidos
    )

    actuales = set(
        EquipoParametro.objects.filter(equipo_id=equipo_id).values_list(
            "parametro_id", flat=True
        )
    )

    a_borrar = actuales - deseados
    a_agregar = deseados - actuales
    a_actualizar = actuales & deseados  # actualizar config si llega

    if a_borrar:
        EquipoParametro.objects.filter(
            equipo_id=equipo_id, parametro_id__in=a_borrar
        ).delete()

    if a_agregar:
        objs = [
            EquipoParametro(
                equipo_id=equipo_id,
                parametro_id=pid,
                config=(config_map.get(pid) or {}),
            )
            for pid in a_agregar
        ]
        EquipoParametro.objects.bulk_create(objs, ignore_conflicts=True)

    # Actualiza configs de los ya existentes si se envían
    for pid in a_actualizar:
        if pid in config_map:
            EquipoParametro.objects.filter(
                equipo_id=equipo_id, parametro_id=pid
            ).update(config=config_map[pid])

    return Response({"parametros": list(deseados)}, status=200)


# ▼▼ colocar cerca de las otras rutas de relaciones ▼▼
@api_view(["GET"])
def parametro_subsistemas(request, parametro_id):
    """
    Devuelve los subsistemas (solo IDs) donde está presente el parámetro dado.
    Respuesta: [10, 11, 12]
    """
    _ = get_object_or_404(Parametro, id=parametro_id)
    ids = list(
        SubsistemaParametro.objects.filter(parametro_id=parametro_id).values_list(
            "subsistema_id", flat=True
        )
    )
    return Response(ids, status=200)


@api_view(["GET"])
def subsistema_parametros_detalle(request, subsistema_id):
    """
    Devuelve parámetros del subsistema con detalle:
    [{id, nombre, unidad, valor_minimo, valor_maximo}, ...]
    """
    _ = get_object_or_404(Subsistema, id=subsistema_id)
    ids = SubsistemaParametro.objects.filter(subsistema_id=subsistema_id).values_list(
        "parametro_id", flat=True
    )
    params = Parametro.objects.filter(id__in=ids).values(
        "id", "nombre", "unidad", "valor_minimo", "valor_maximo"
    )
    return Response(list(params), status=200)


# views.py
@api_view(["GET"])
def equipo_parametros_seleccionados(request, equipo_id):
    """
    Devuelve [ids] de parámetros seleccionados para el equipo (equipo_parametros).
    """
    ids = list(
        EquipoParametro.objects.filter(equipo_id=equipo_id).values_list(
            "parametro_id", flat=True
        )
    )
    return Response(ids, status=200)


@api_view(["POST"])
def equipo_fijar_parametros(request, equipo_id):
    """
    Cuerpo:
    {
      "parametros": [1,2,3],
      "config_por_parametro": { "1": {"umbral": 70}, "3": {"nota": "X"} }  # opcional
    }
    Guarda la selección para el equipo, permitiendo cualquier parámetro del catálogo.
    """
    equipo = get_object_or_404(Equipo, id=equipo_id)

    ids = request.data.get("parametros", [])
    config_map = request.data.get("config_por_parametro", {}) or {}

    try:
        ids = [int(x) for x in ids]
        config_map = {int(k): v for k, v in config_map.items()}
    except Exception:
        return Response({"error": "IDs deben ser enteros"}, status=400)

    # Acepta cualquier parámetro existente (sin restringir por subsistema)
    deseados = set(Parametro.objects.filter(id__in=ids).values_list("id", flat=True))

    actuales = set(
        EquipoParametro.objects.filter(equipo_id=equipo_id).values_list(
            "parametro_id", flat=True
        )
    )

    a_borrar = actuales - deseados
    a_agregar = deseados - actuales
    a_actualizar = actuales & deseados  # actualizar config si llega

    if a_borrar:
        EquipoParametro.objects.filter(
            equipo_id=equipo_id, parametro_id__in=a_borrar
        ).delete()

    if a_agregar:
        objs = []
        for pid in a_agregar:
            cfg = config_map.get(pid) or {}
            # Normalizar posibles aliases de claves
            norm_cfg = {
                "min": cfg.get("min", cfg.get("valor_minimo")),
                "max": cfg.get("max", cfg.get("valor_maximo")),
            }
            # Mantener otras claves si vinieran (notas, etc.)
            for k, v in cfg.items():
                if k not in ("min", "max", "valor_minimo", "valor_maximo"):
                    norm_cfg[k] = v
            objs.append(
                EquipoParametro(equipo_id=equipo_id, parametro_id=pid, config=norm_cfg)
            )
        EquipoParametro.objects.bulk_create(objs, ignore_conflicts=True)

    for pid in a_actualizar:
        if pid in config_map:
            cfg = config_map[pid] or {}
            norm_cfg = {
                "min": cfg.get("min", cfg.get("valor_minimo")),
                "max": cfg.get("max", cfg.get("valor_maximo")),
            }
            for k, v in cfg.items():
                if k not in ("min", "max", "valor_minimo", "valor_maximo"):
                    norm_cfg[k] = v
            EquipoParametro.objects.filter(
                equipo_id=equipo_id, parametro_id=pid
            ).update(config=norm_cfg)

    return Response({"parametros": list(deseados)}, status=200)


@api_view(["GET"])
def api_equipo_por_nombre(request, nombre):
    """
    Busca un equipo por su nombre (texto exacto). Si hay varios con el mismo nombre,
    devuelve el primero. Si no existe, 404.
    """
    nombre_decod = unquote(nombre)
    eq = Equipo.objects.filter(nombre_equipo=nombre_decod).first()
    if not eq:
        return Response({"detail": "Equipo no encontrado"}, status=404)

    return Response(
        {
            "id": eq.id,
            "nombre_equipo": eq.nombre_equipo,
            "grupo_id": eq.grupo_id,
            "subgrupo_id": eq.subgrupo_id,
            "sistema_id": eq.sistema_id,
            "subsistema_id": eq.subsistema_id,
        },
        status=200,
    )


# === RONDA: parámetros (detalle) seleccionados para el equipo ===
@api_view(["GET"])
def equipo_parametros_detalle(request, equipo_id):
    """
    Devuelve SOLO los parámetros seleccionados para el equipo (tabla equipo_parametros)
    con detalle para render de formulario. Incluye min/max efectivos aplicando overrides
    guardados en EquipoParametro.config si existen.
    Respuesta por item:
      {
        id, nombre, unidad,
        valor_minimo, valor_maximo,                 # EFECTIVOS (override si existe, si no los globales)
        default_valor_minimo, default_valor_maximo, # Valores globales del catálogo Parametro
        override_config: { min, max }               # Solo si hay override definido (o null)
      }
    """
    eps = EquipoParametro.objects.filter(equipo_id=equipo_id).values(
        "config", "parametro_id"
    )
    # Get all parametro ids
    param_ids = [ep["parametro_id"] for ep in eps]
    # Get all parametros in one query
    params = {p.id: p for p in Parametro.objects.filter(id__in=param_ids)}
    # Map config by parametro_id
    configs = {ep["parametro_id"]: ep["config"] or {} for ep in eps}

    out = []
    for pid in param_ids:
        p = params[pid]
        cfg = configs[pid]
        # aceptar 'min'/'max' o 'valor_minimo'/'valor_maximo' como keys
        o_min = cfg.get("min", cfg.get("valor_minimo"))
        o_max = cfg.get("max", cfg.get("valor_maximo"))
        eff_min = o_min if o_min is not None else p.valor_minimo
        eff_max = o_max if o_max is not None else p.valor_maximo
        out.append(
            {
                "id": p.id,
                "nombre": p.nombre,
                "unidad": p.unidad,
                # EFECTIVOS para uso directo por el front
                "valor_minimo": eff_min,
                "valor_maximo": eff_max,
                # Defaults de catálogo
                "default_valor_minimo": p.valor_minimo,
                "default_valor_maximo": p.valor_maximo,
                # Configuración de override almacenada
                "override_config": {"min": o_min, "max": o_max},
            }
        )
    return Response(out, status=200)


# === NUEVO: parámetros detalle batch ===
@api_view(["GET"])
def equipos_parametros_detalle_batch(request):
    """Devuelve los parámetros seleccionados para múltiples equipos en una sola llamada.

    Filtros aceptados (query params):
      - buque_id: si se pasa, se incluyen todos los equipos de ese buque.
      - equipos: lista separada por comas de IDs de equipo específica (tiene prioridad si se manda)

    Respuesta:
    {
      "equipos": {
        <equipo_id>: {
           "equipo_id": int,
           "parametros": [ {id, nombre, unidad, valor_minimo, valor_maximo}, ... ]
        }, ...
      },
      "total_equipos": N,
      "total_parametros": M
    }
    """
    from .models import Equipo, EquipoParametro, Parametro

    equipos_ids_param = request.GET.get("equipos")
    buque_id = request.GET.get("buque_id")

    equipo_ids = []
    if equipos_ids_param:
        try:
            equipo_ids = [
                int(x) for x in equipos_ids_param.split(",") if x.strip().isdigit()
            ]
        except Exception:
            return Response({"error": "Formato inválido en 'equipos'"}, status=400)
    elif buque_id:
        equipo_ids = list(
            Equipo.objects.filter(buque_id=buque_id).values_list("id", flat=True)
        )
    else:
        return Response({"error": "Debe indicar buque_id o equipos"}, status=400)

    if not equipo_ids:
        return Response(
            {"equipos": {}, "total_equipos": 0, "total_parametros": 0}, status=200
        )

    # Relación equipo->parametro ids
    rels = EquipoParametro.objects.filter(equipo_id__in=equipo_ids).values(
        "equipo_id", "parametro_id"
    )

    # Agrupar parámetro ids por equipo
    eq_param_ids = {}
    all_param_ids = set()
    for r in rels:
        eq_id = r["equipo_id"]
        pid = r["parametro_id"]
        eq_param_ids.setdefault(eq_id, set()).add(pid)
        all_param_ids.add(pid)

    # Obtener detalles de TODOS los parámetros en un solo query
    param_map = {
        p["id"]: p
        for p in Parametro.objects.filter(id__in=all_param_ids).values(
            "id", "nombre", "unidad", "valor_minimo", "valor_maximo"
        )
    }

    out = {}
    total_parametros = 0
    for eq_id, pids in eq_param_ids.items():
        plist = [param_map[pid] for pid in pids if pid in param_map]
        total_parametros += len(plist)
        out[eq_id] = {"equipo_id": eq_id, "parametros": plist}

    return Response(
        {
            "equipos": out,
            "total_equipos": len(out),
            "total_parametros": total_parametros,
        },
        status=200,
    )


@api_view(["GET"])
def api_equipo_por_slug(request, slug):
    """
    Busca el equipo cuyo slugify(nombre_equipo) == slug.
    Si hay varios iguales (no debería), devuelve el primero.
    """
    # Para evitar traer campos innecesarios:
    for eq in Equipo.objects.only(
        "id", "nombre_equipo", "grupo_id", "subgrupo_id", "sistema_id", "subsistema_id"
    ):
        if slugify(eq.nombre_equipo) == slug:
            return Response(
                {
                    "id": eq.id,
                    "nombre_equipo": eq.nombre_equipo,
                    "grupo_id": eq.grupo_id,
                    "subgrupo_id": eq.subgrupo_id,
                    "sistema_id": eq.sistema_id,
                    "subsistema_id": eq.subsistema_id,
                },
                status=200,
            )

    return Response({"detail": "Equipo no encontrado"}, status=404)


@api_view(["GET", "POST", "PUT", "DELETE"])
def api_rondas(request):
    if request.method == "GET":
        qs = Ronda.objects.select_related(
            "equipo",
            "buque",
            "equipo__grupo",
            "equipo__subgrupo",
            "equipo__sistema",
            "equipo__subsistema",
        ).order_by("-tomado_en")

        # -------- Filtros jerárquicos --------
        grupo_id = request.GET.get("grupo_id")
        subgrupo_id = request.GET.get("subgrupo_id")
        sistema_id = request.GET.get("sistema_id")
        subsistema_id = request.GET.get("subsistema_id")
        buque_id = request.GET.get("buque_id")
        equipo_id = request.GET.get("equipo_id")

        if grupo_id:
            qs = qs.filter(equipo__grupo_id=grupo_id)
        if subgrupo_id:
            qs = qs.filter(equipo__subgrupo_id=subgrupo_id)
        if sistema_id:
            qs = qs.filter(equipo__sistema_id=sistema_id)
        if subsistema_id:
            qs = qs.filter(equipo__subsistema_id=subsistema_id)
        if buque_id:
            qs = qs.filter(Q(buque_id=buque_id) | Q(equipo__buque_id=buque_id))
        if equipo_id:
            qs = qs.filter(equipo_id=equipo_id)

        # -------- Filtros fecha/hora/persona --------
        fecha_desde = request.GET.get("fecha_desde")  # YYYY-MM-DD
        fecha_hasta = request.GET.get("fecha_hasta")  # YYYY-MM-DD
        hora_desde = request.GET.get("hora_desde")  # HH:MM
        hora_hasta = request.GET.get("hora_hasta")  # HH:MM
        persona = request.GET.get("tomado_por")  # icontains

        if fecha_desde:
            d = parse_date(fecha_desde)
            if not d:
                return Response(
                    {"error": "fecha_desde inválida (YYYY-MM-DD)"}, status=400
                )
            qs = qs.filter(tomado_en__date__gte=d)
        if fecha_hasta:
            d = parse_date(fecha_hasta)
            if not d:
                return Response(
                    {"error": "fecha_hasta inválida (YYYY-MM-DD)"}, status=400
                )
            qs = qs.filter(tomado_en__date__lte=d)

        if hora_desde:
            try:
                hh, mm = map(int, hora_desde.split(":"))
                qs = qs.filter(tomado_en__time__gte=f"{hh:02d}:{mm:02d}:00")
            except Exception:
                return Response({"error": "hora_desde inválida (HH:MM)"}, status=400)
        if hora_hasta:
            try:
                hh, mm = map(int, hora_hasta.split(":"))
                qs = qs.filter(tomado_en__time__lte=f"{hh:02d}:{mm:02d}:00")
            except Exception:
                return Response({"error": "hora_hasta inválida (HH:MM)"}, status=400)

        if persona:
            # Permitir búsqueda amplia: operador/persona, nombre del equipo y observaciones
            qs = qs.filter(
                Q(tomado_por__icontains=persona)
                | Q(equipo__nombre_equipo__icontains=persona)
                | Q(observaciones__icontains=persona)
            )

        # -------- Paginación --------
        try:
            page = max(int(request.GET.get("page", 1)), 1)
            page_size = int(request.GET.get("page_size", 50))
            page_size = max(min(page_size, 200), 1)
        except Exception:
            page, page_size = 1, 50

        total = qs.count()
        start = (page - 1) * page_size
        end = start + page_size

        qs = qs.annotate(num_lecturas=Count("lecturas"))[start:end]

        data = []
        for r in qs:
            eq = r.equipo
            buque = r.buque or eq.buque
            data.append(
                {
                    "id": r.id,
                    "equipo_id": r.equipo_id,
                    "equipo_nombre": eq.nombre_equipo,
                    "buque_id": r.buque_id or eq.buque_id,
                    "buque_nombre": getattr(buque, "nombre", None),
                    "tomado_en": r.tomado_en.isoformat(),
                    "observaciones": r.observaciones,
                    "tomado_por": r.tomado_por,
                    "num_lecturas": r.num_lecturas,
                    "grupo_ref": getattr(eq.grupo, "numero_de_referencia", None),
                    "grupo_desc": getattr(eq.grupo, "descripcion", None),
                    "subgrupo_ref": getattr(eq.subgrupo, "numero_de_referencia", None),
                    "subgrupo_desc": getattr(eq.subgrupo, "descripcion", None),
                    "sistema_ref": getattr(eq.sistema, "numero_de_referencia", None),
                    "sistema_desc": getattr(eq.sistema, "descripcion", None),
                    "subsistema_ref": getattr(
                        eq.subsistema, "numero_de_referencia", None
                    ),
                    "subsistema_desc": getattr(eq.subsistema, "descripcion", None),
                }
            )

            print(data)

        return Response(
            {"results": data, "page": page, "page_size": page_size, "total": total},
            status=200,
        )

    if request.method == "DELETE":
        equipo_id = request.GET.get("equipo_id")
        if not equipo_id:
            return JsonResponse(
                {"success": False, "error": "Falta equipo_id"}, status=400
            )
        try:
            equipo = Equipo.objects.get(id=equipo_id)
            imagen_path = equipo.imagen
            equipo.imagen = None
            equipo.save()
            import os

            if imagen_path and "default_equipo.png" not in imagen_path:
                full_path = os.path.join(settings.BASE_DIR, imagen_path)
                if os.path.exists(full_path):
                    try:
                        os.remove(full_path)
                    except Exception:
                        pass
            return JsonResponse({"success": True})
        except Equipo.DoesNotExist:
            return JsonResponse(
                {"success": False, "error": "Equipo no encontrado"}, status=404
            )
        except Exception as e:
            return JsonResponse({"success": False, "error": str(e)}, status=500)
        return JsonResponse(
            {"success": False, "error": "Método no permitido"}, status=405
        )

    # -------- POST: crear --------
    data = request.data
    try:
        equipo_id = int(data.get("equipo_id"))
    except Exception:
        return Response({"error": "equipo_id inválido"}, status=400)

    equipo = get_object_or_404(Equipo, id=equipo_id)
    lecturas = data.get("lecturas") or []
    if not isinstance(lecturas, list) or not lecturas:
        return Response({"error": "lecturas debe ser lista no vacía"}, status=400)

    observaciones = data.get("observaciones", "")
    # Asignar automáticamente el operador (usuario autenticado) si no se envía o viene vacío.
    raw_tomado_por = (data.get("tomado_por") or "").strip()
    actor = getattr(request, "auth_user", None)
    if raw_tomado_por:
        tomado_por = raw_tomado_por
    else:
        if actor:
            # Preferimos nombre + apellido si existen, si no username, si no email
            full_name = f"{(actor.first_name or '').strip()} {(actor.last_name or '').strip()}".strip()
            tomado_por = full_name or actor.username or actor.email or ""
        else:
            tomado_por = ""  # fallback (no debería ocurrir si auth middleware funciona)
    tomado_en = data.get("tomado_en")  # Usar la fecha/hora enviada desde el frontend

    # DEBUG: Ver qué llega del frontend
    print(f"🔍 DEBUG tomado_en from frontend: {tomado_en}")
    print(f"🔍 DEBUG type: {type(tomado_en)}")

    # Parse el datetime si viene como string (sin conversiones de timezone)
    if tomado_en:
        if isinstance(tomado_en, str):
            from django.utils.dateparse import parse_datetime

            tomado_en = parse_datetime(tomado_en)
            print(f"🔍 DEBUG parsed datetime: {tomado_en}")

        print(f"🔍 DEBUG final tomado_en to use: {tomado_en}")
    else:
        from datetime import datetime

        tomado_en = datetime.now()  # datetime naive sin timezone
        print(f"🔍 DEBUG using datetime.now(): {tomado_en}")

    # --- NUEVO: validar ventana según config del BUQUE (equipo.buque o buque enviado) ---
    buque_ref = equipo.buque  # priorizamos buque ligado al equipo
    if not buque_ref:
        # como fallback, si vino buque_id en body
        try:
            buque_id_body = int(data.get("buque_id")) if data.get("buque_id") else None
        except Exception:
            buque_id_body = None
        if buque_id_body:
            buque_ref = get_object_or_404(Buque, id=buque_id_body)

    if not buque_ref:
        return Response(
            {"error": "No hay buque asociado para evaluar ventana de ronda."},
            status=400,
        )

    rcfg = buque_ref.rondas_config or {}
    st = _compute_slot(rcfg)
    if not st["allowed_now"]:
        return Response(
            {
                "error": "Fuera de ventana",
                "detail": st["reason"],
                "next_start": (
                    st["next_start"].isoformat() if st["next_start"] else None
                ),
            },
            status=403,
        )

    # Verificar si hay ronda existente en la ventana para actualizar
    actualizar_existente = data.get("actualizar_existente", False)
    ronda_existente = None

    if actualizar_existente:
        ronda_existente = Ronda.objects.filter(
            equipo_id=equipo_id,
            tomado_en__gte=st["window_start"],
            tomado_en__lte=st["window_end"],
        ).first()
    else:
        # Comportamiento original: evitar duplicado dentro del mismo slot por equipo
        if Ronda.objects.filter(
            equipo_id=equipo_id,
            tomado_en__gte=st["window_start"],
            tomado_en__lte=st["window_end"],
        ).exists():
            return Response(
                {
                    "error": "Duplicado",
                    "detail": "Este equipo ya tiene una ronda registrada en la ventana actual.",
                },
                status=409,
            )

    with transaction.atomic():
        if ronda_existente:
            # Actualizar ronda existente
            ronda_existente.tomado_en = tomado_en
            ronda_existente.observaciones = observaciones
            ronda_existente.tomado_por = tomado_por
            ronda_existente.save()

            # Eliminar lecturas anteriores
            ronda_existente.lecturas.all().delete()
            ronda = ronda_existente
        else:
            # Crear nueva ronda
            ronda = Ronda.objects.create(
                equipo=equipo,
                buque=equipo.buque,
                tomado_en=tomado_en,  # Usar fecha parseada del frontend
                observaciones=observaciones,
                tomado_por=tomado_por,
            )

        params = Parametro.objects.in_bulk(
            [lec.get("parametro_id") for lec in lecturas]
        )
        # Traer overrides por una sola consulta
        overrides = {
            ep["parametro_id"]: (ep["config"] or {})
            for ep in EquipoParametro.objects.filter(
                equipo_id=equipo_id,
                parametro_id__in=list(params.keys()),
            ).values("parametro_id", "config")
        }
        objs = []
        for lec in lecturas:
            pid = lec.get("parametro_id")
            val = lec.get("valor")
            try:
                pid = int(pid)
            except Exception:
                return Response({"error": f"parametro_id inválido: {pid}"}, status=400)
            if pid not in params:
                return Response({"error": f"Parámetro {pid} no existe"}, status=400)
            p = params[pid]
            cfg = overrides.get(pid) or {}
            o_min = cfg.get("min", cfg.get("valor_minimo"))
            o_max = cfg.get("max", cfg.get("valor_maximo"))
            eff_min = o_min if o_min is not None else p.valor_minimo
            eff_max = o_max if o_max is not None else p.valor_maximo
            objs.append(
                RondaLectura(
                    ronda=ronda,
                    parametro=p,
                    valor=val,
                    unidad=p.unidad or "",
                    valor_minimo=eff_min,
                    valor_maximo=eff_max,
                )
            )
        RondaLectura.objects.bulk_create(objs)

    # Respuesta que indica si fue creación o actualización
    status_code = 200 if ronda_existente else 201
    action = "actualizada" if ronda_existente else "creada"
    return Response({"id": ronda.id, "action": action}, status=status_code)


@api_view(["GET"])
def api_rondas_detail(request, ronda_id):
    r = get_object_or_404(
        Ronda.objects.select_related("equipo", "buque").prefetch_related(
            "lecturas__parametro"
        ),
        id=ronda_id,
    )
    lects = [
        {
            "parametro_id": l.parametro_id,
            "parametro_nombre": l.parametro.nombre,
            "valor": str(l.valor),
            "unidad": l.unidad,
            "valor_minimo": l.valor_minimo,
            "valor_maximo": l.valor_maximo,
        }
        for l in r.lecturas.all()
    ]
    return Response(
        {
            "id": r.id,
            "equipo_id": r.equipo_id,
            "equipo_nombre": r.equipo.nombre_equipo,
            "buque_id": r.buque_id,
            "tomado_en": r.tomado_en.isoformat(),
            "observaciones": r.observaciones,
            "tomado_por": r.tomado_por,
            "lecturas": lects,
            "created_at": r.created_at.isoformat(),
        },
        status=200,
    )


@api_view(["GET"])
def _doc_meta_from_upload_equipo(f, tipo: str):
    rel = guardar_archivo(f, subdir="media/uploads/equipo_docs")
    return {
        "id": uuid.uuid4().hex,
        "name": f.name,
        "type": tipo or "Otro",
        "url": rel,
        "size": getattr(f, "size", None),
        "uploaded_at": datetime.utcnow().isoformat(),
    }


def _abs_docs(docs, request):
    out = []
    for d in docs or []:
        dd = dict(d)
        dd["url"] = _absurl(request, dd.get("url", ""))
        out.append(dd)
    return out


@api_view(["GET", "POST", "PUT", "DELETE"])
def api_equipo_documentos(request, equipo_id):
    """
    GET:    lista documentos (URLs absolutas)
    POST:   agrega nuevos -> form-data: docs_new[] + docs_new_types[]
    PUT:    reemplaza meta completa -> field 'documentos' (JSON)
    DELETE: elimina por ids -> field 'docs_remove_ids' (JSON array)
    """
    equipo = get_object_or_404(Equipo, id=equipo_id)

    if request.method == "GET":
        return Response(_abs_docs(equipo.documentos, request), status=200)

    if request.method == "POST":
        files = request.FILES.getlist("docs_new")
        types = (
            request.data.getlist("docs_new_types")
            if hasattr(request.data, "getlist")
            else []
        )
        metas = []
        for i, f in enumerate(files or []):
            tipo = (types[i] if i < len(types) else "Otro") or "Otro"
            metas.append(_doc_meta_from_upload_equipo(f, tipo))

        if metas:
            equipo.documentos = (equipo.documentos or []) + metas
            equipo.save()

            # Send webhook notification for uploads in background to avoid blocking response
            # This prevents "Broken pipe" errors when webhook takes too long
            import threading
            def send_webhook_async():
                try:
                    send_document_upload_webhook(
                        equipo_id=equipo_id,
                        equipo_name=equipo.nombre_equipo,
                        uploaded_documents=metas,
                    )
                except Exception as e:
                    logger.error(f"Background webhook failed for equipo {equipo_id}: {e}")
            
            thread = threading.Thread(target=send_webhook_async, daemon=True)
            thread.start()

            return Response(
                {"created": len(metas), "webhook": {"sent": True, "async": True}}, status=201
            )

        return Response({"created": 0, "webhook": {"sent": False}}, status=201)

    if request.method == "PUT":
        equipo.documentos = _sanitize_docs_meta(request.data.get("documentos"))
        equipo.save()
        return Response({"updated": len(equipo.documentos)}, status=200)

    # DELETE
    ids = set(_parse_json(request.data.get("docs_remove_ids"), []))
    if not ids:
        return Response({"removed": 0, "webhook": {"sent": False}}, status=200)

    # Get documents to be deleted for webhook payload
    docs_to_delete = [d for d in (equipo.documentos or []) if d.get("id") in ids]

    # Remove documents from metadata
    equipo.documentos = [d for d in (equipo.documentos or []) if d.get("id") not in ids]
    equipo.save()

    # Delete physical files safely
    for _d in docs_to_delete:
        try:
            _delete_file_safely(_d.get("url"))
        except Exception:
            pass

    # Send webhook notification in background to avoid blocking response
    import threading
    def send_delete_webhook_async():
        try:
            send_document_deletion_webhook(
                equipo_id=equipo_id,
                equipo_name=equipo.nombre_equipo,
                deleted_documents=docs_to_delete,
            )
        except Exception as e:
            logger.error(f"Background deletion webhook failed for equipo {equipo_id}: {e}")
    
    thread = threading.Thread(target=send_delete_webhook_async, daemon=True)
    thread.start()

    return Response({"removed": len(ids), "webhook": {"sent": True, "async": True}}, status=200)


DOW_MAP = {0: "L", 1: "M", 2: "X", 3: "J", 4: "V", 5: "S", 6: "D"}


def _parse_hhmm(s: str, default: timecls = timecls(0, 0)) -> timecls:
    try:
        hh, mm = map(int, (s or "").split(":", 1))
        return timecls(hh, mm)
    except Exception:
        return default


def _to_local(now=None):
    tz = get_current_timezone()
    now_utc = timezone.now() if now is None else now
    # Si el datetime es naive, hazlo aware
    if timezone.is_naive(now_utc):
        now_utc = timezone.make_aware(now_utc, tz)
    return timezone.localtime(now_utc, tz)


def _is_active_day(localdate, dias_activos):
    return DOW_MAP[localdate.weekday()] in set(
        dias_activos or ["L", "M", "X", "J", "V", "S", "D"]
    )


def _add_days(d, n):
    return (d + timedelta(days=n)).date()


def _next_active_date(localdate, dias_activos):
    for i in range(1, 8):
        cand = _add_days(localdate, i)
        if _is_active_day(cand, dias_activos):
            return cand
    return _add_days(localdate, 1)


def _interval_to_timedelta(intervalo: int, unidad: str) -> timedelta:
    unidad = (unidad or "").lower()
    if unidad.startswith("hora"):
        return timedelta(hours=int(intervalo or 1))
    if unidad.startswith("min"):
        return timedelta(minutes=int(intervalo or 1))
    # fallback
    return timedelta(hours=int(intervalo or 1))


def _compute_slot(rcfg: dict, now_local=None):
    """
    Calcula estado de ventana actual y próxima.
    - Soporta ventanas que cruzan medianoche (p.ej. 20:00→02:00)
    - Trata 00:00→00:00 como ventana de 24 horas (último arranque = 23:00 si intervalo = 1h)
    Retorna: {allowed_now, window_start, window_end, next_start, reason}
    Todo en TZ local.
    """
    now_local = _to_local(now_local)
    tz = now_local.tzinfo
    hoy = now_local.date()
    dias_activos = rcfg.get("dias_activos") or ["L", "M", "X", "J", "V", "S", "D"]
    start_t = _parse_hhmm(rcfg.get("ventana_inicio", "00:00"))
    end_t = _parse_hhmm(rcfg.get("ventana_fin", "23:59"))

    # Inicio base: hoy a start_t
    base_start = datetime.combine(hoy, start_t, tzinfo=tz)

    # Fin de ventana (day_limit) con soporte de cruce de día
    # - end == start  -> full day (24h)
    # - end  < start  -> cruza medianoche (fin es al día siguiente)
    if end_t == start_t:
        day_limit = base_start + timedelta(days=1)  # 24h
    elif end_t > start_t:
        day_limit = datetime.combine(hoy, end_t, tzinfo=tz)
    else:
        # Cruza medianoche
        day_limit = datetime.combine(hoy + timedelta(days=1), end_t, tzinfo=tz)
        # Si estamos en la madrugada (antes de end_t), esa ventana empezó "ayer"
        early_cut = datetime.combine(hoy, end_t, tzinfo=tz)
        if now_local < early_cut:
            base_start -= timedelta(days=1)
            day_limit -= timedelta(days=1)

    # Día de inicio efectivo para validar día activo y calcular "siguiente"
    start_day = base_start.date()
    if not _is_active_day(start_day, dias_activos):
        next_date = _next_active_date(start_day, dias_activos)
        next_start = datetime.combine(next_date, start_t, tzinfo=tz)
        return {
            "allowed_now": False,
            "window_start": None,
            "window_end": None,
            "next_start": next_start,
            "reason": "Día no activo",
        }

    if now_local < base_start:
        return {
            "allowed_now": False,
            "window_start": None,
            "window_end": None,
            "next_start": base_start,
            "reason": "Antes de la primera ventana del día",
        }

    intervalo = int(rcfg.get("intervalo", 1))
    unidad = rcfg.get("unidad", "hora")
    slot_step = _interval_to_timedelta(intervalo, unidad)

    max_duracion_min = int(rcfg.get("max_duracion_min", 15))
    dur = timedelta(minutes=max_duracion_min)

    # Último arranque permitido dentro de la ventana
    last_start = day_limit - slot_step  # p.ej. para 24h y 1h -> 23:00

    # Slot alineado que te corresponde por ahora
    delta = now_local - base_start
    k = int(delta.total_seconds() // slot_step.total_seconds())
    slot_start = base_start + k * slot_step
    slot_end = slot_start + dur

    # Si ya pasamos del último arranque de esta ventana
    if slot_start > last_start:
        next_date = _next_active_date(start_day, dias_activos)
        next_start = datetime.combine(next_date, start_t, tzinfo=tz)
        return {
            "allowed_now": False,
            "window_start": None,
            "window_end": None,
            "next_start": next_start,
            "reason": "Ventana fuera de rango diario",
        }

    # ¿Estamos dentro del slot activo?
    if slot_start <= now_local <= min(slot_end, day_limit):
        nxt = slot_start + slot_step
        if nxt > last_start:
            nxt = datetime.combine(
                _next_active_date(start_day, dias_activos), start_t, tzinfo=tz
            )
        return {
            "allowed_now": True,
            "window_start": slot_start,
            "window_end": min(slot_end, day_limit),
            "next_start": nxt,
            "reason": "Dentro de ventana",
        }

    # Aún no comienza el siguiente slot dentro de la ventana
    next_slot = slot_start + slot_step
    if next_slot <= last_start:
        next_start = next_slot
    else:
        next_start = datetime.combine(
            _next_active_date(start_day, dias_activos), start_t, tzinfo=tz
        )

    return {
        "allowed_now": False,
        "window_start": slot_start,
        "window_end": min(slot_end, day_limit),
        "next_start": next_start,
        "reason": "Fuera de ventana",
    }


@api_view(["GET"])
def api_rondas_estado(request):
    """
    Estado de ventana de rondas para un buque (y opcional equipo).
    Query: ?buque_id=... [&equipo_id=...]
    Si no llega buque_id pero llega equipo_id, se deriva del equipo.
    """
    buque_id = request.GET.get("buque_id")
    equipo_id = request.GET.get("equipo_id")

    # 1) Intentar parsear buque_id
    buque = None
    if buque_id:
        try:
            buque = get_object_or_404(Buque, id=int(buque_id))
        except Exception:
            return Response({"error": "buque_id inválido"}, status=400)

    # 2) Si no llegó buque_id, pero sí equipo_id, derivar del equipo
    if not buque and equipo_id:
        try:
            eq = get_object_or_404(Equipo, id=int(equipo_id))
            if not eq.buque_id:
                return Response(
                    {"error": "El equipo no tiene buque asociado"}, status=400
                )
            buque = get_object_or_404(Buque, id=eq.buque_id)
        except Exception:
            return Response(
                {"error": "equipo_id inválido o sin buque asociado"}, status=400
            )

    if not buque:
        return Response(
            {"error": "buque_id requerido (o enviar equipo_id para derivarlo)"},
            status=400,
        )

    rcfg = buque.rondas_config or {
        "intervalo": 1,
        "unidad": "hora",
        "max_duracion_min": 15,
        "ventana_inicio": "00:00",
        "ventana_fin": "23:59",
        "dias_activos": ["L", "M", "X", "J", "V", "S", "D"],
    }

    st = _compute_slot(rcfg)
    now_local = _to_local()

    remaining_to_open = None
    remaining_to_close = None
    if not st["allowed_now"] and st["next_start"]:
        remaining_to_open = int((st["next_start"] - now_local).total_seconds())
    if st["allowed_now"] and st["window_end"]:
        remaining_to_close = int((st["window_end"] - now_local).total_seconds())

    # ¿ya se tomó una ronda en esta ventana para ese equipo?
    already_taken = False
    if equipo_id and st["window_start"] and st["window_end"]:
        try:
            eid = int(equipo_id)
            already_taken = Ronda.objects.filter(
                equipo_id=eid,
                tomado_en__gte=st["window_start"],
                tomado_en__lte=st["window_end"],
            ).exists()
        except Exception:
            pass

    data = {
        "allowed_now": bool(st["allowed_now"]) and not already_taken,
        "already_done": bool(
            already_taken
        ),  # nuevo: indica si ya existe ronda en esta ventana
        "reason": (
            "Ya se registró una ronda en esta ventana para este equipo"
            if already_taken
            else st["reason"]
        ),
        "window_start": st["window_start"].isoformat() if st["window_start"] else None,
        "window_end": st["window_end"].isoformat() if st["window_end"] else None,
        "next_start": st["next_start"].isoformat() if st["next_start"] else None,
        "remaining_to_open_sec": remaining_to_open,
        "remaining_to_close_sec": remaining_to_close,
        "config": rcfg,
    }
    return Response(data, status=200)


@api_view(["GET"])
def api_rondas_estado_multiple(request):
    """Estado de ronda (allowed / already_done) para múltiples equipos.

    Query params:
      buque_id (requerido si los equipos no derivan su buque automáticamente)
      equipos=1,2,3 (lista de IDs de equipo)

    Devuelve: { "results": [ {"equipo_id": 1, "allowed_now": bool, "already_done": bool} ... ],
                "window": {window_start, window_end, next_start, remaining_to_open_sec, remaining_to_close_sec} }

    Nota: Se asume que todos los equipos pertenecen al mismo buque (optimización del cálculo de ventana).
    """
    equipos_param = request.GET.get("equipos", "").strip()
    buque_id = request.GET.get("buque_id")
    if not equipos_param:
        return Response({"error": "Parámetro 'equipos' requerido"}, status=400)

    try:
        equipo_ids = [int(e) for e in equipos_param.split(",") if e]
    except Exception:
        return Response({"error": "Formato inválido de 'equipos'"}, status=400)
    if not equipo_ids:
        return Response({"error": "Lista de equipos vacía"}, status=400)

    # Obtener el buque (opcionalmente derivado del primero si no llega buque_id)
    buque = None
    if buque_id:
        try:
            buque = get_object_or_404(Buque, id=int(buque_id))
        except Exception:
            return Response({"error": "buque_id inválido"}, status=400)
    else:
        # Derivar del primer equipo
        try:
            first_eq = get_object_or_404(Equipo, id=equipo_ids[0])
            buque = get_object_or_404(Buque, id=first_eq.buque_id)
        except Exception:
            return Response(
                {"error": "No se pudo derivar buque a partir del primer equipo"},
                status=400,
            )

    rcfg = buque.rondas_config or {
        "intervalo": 1,
        "unidad": "hora",
        "max_duracion_min": 15,
        "ventana_inicio": "00:00",
        "ventana_fin": "23:59",
        "dias_activos": ["L", "M", "X", "J", "V", "S", "D"],
    }
    st = _compute_slot(rcfg)
    now_local = _to_local()

    remaining_to_open = None
    remaining_to_close = None
    if not st["allowed_now"] and st["next_start"]:
        remaining_to_open = int((st["next_start"] - now_local).total_seconds())
    if st["allowed_now"] and st["window_end"]:
        remaining_to_close = int((st["window_end"] - now_local).total_seconds())

    # Consultar rondas existentes dentro de la ventana (una query)
    already_map = {}
    if st["window_start"] and st["window_end"]:
        existing = (
            Ronda.objects.filter(
                equipo_id__in=equipo_ids,
                tomado_en__gte=st["window_start"],
                tomado_en__lte=st["window_end"],
            )
            .values_list("equipo_id", flat=True)
            .distinct()
        )
        already_map = {eid: True for eid in existing}

    results = []
    for eid in equipo_ids:
        taken = already_map.get(eid, False)
        results.append(
            {
                "equipo_id": eid,
                "allowed_now": bool(st["allowed_now"]) and not taken,
                "already_done": taken,
            }
        )

    return Response(
        {
            "results": results,
            "window": {
                "window_start": (
                    st["window_start"].isoformat() if st["window_start"] else None
                ),
                "window_end": (
                    st["window_end"].isoformat() if st["window_end"] else None
                ),
                "next_start": (
                    st["next_start"].isoformat() if st["next_start"] else None
                ),
                "remaining_to_open_sec": remaining_to_open,
                "remaining_to_close_sec": remaining_to_close,
            },
            "config": rcfg,
        },
        status=200,
    )


@api_view(["DELETE"])
def api_delete_test_data(request):
    """
    Endpoint para eliminar las lecturas de prueba generadas por el sistema
    Incluye datos del endpoint individual y del endpoint batch
    """
    try:
        # Buscar rondas de prueba tanto del endpoint individual como del batch
        rondas_prueba = Ronda.objects.filter(
            Q(tomado_por="Sistema de Prueba")
            | Q(tomado_por="Sistema de Prueba Batch")
            | Q(tomado_por="Sistema Tiempo Real")
            | Q(observaciones__contains="Datos de prueba generados automáticamente")
            | Q(observaciones__contains="Datos de prueba automáticos")
            | Q(observaciones__contains="Dato tiempo real")
        )
        count = rondas_prueba.count()

        with transaction.atomic():
            RondaLectura.objects.filter(
                ronda_id__in=rondas_prueba.values_list("id", flat=True)
            ).delete()
            rondas_prueba.delete()

        return Response(
            {"message": "Datos de prueba eliminados", "rondas_eliminadas": count},
            status=200,
        )
    except Exception as e:
        return Response({"error": str(e)}, status=500)


# 🔹 API endpoints para historial de equipos


@api_view(["GET"])
def api_lecturas_equipo_parametro(request, equipo_id, parametro_id):
    """
    Endpoint para obtener lecturas específicas de un equipo y parámetro.
    Retorna las lecturas reales de la base de datos para el equipo y parámetro especificados.
    """
    try:
        # Verificar que el equipo existe
        equipo = get_object_or_404(Equipo, id=equipo_id)
        parametro = get_object_or_404(Parametro, id=parametro_id)

        # Obtener lecturas específicas del equipo y parámetro
        lecturas = (
            RondaLectura.objects.filter(
                ronda__equipo_id=equipo_id, parametro_id=parametro_id
            )
            .select_related("ronda", "parametro")
            .order_by("-ronda__tomado_en")
        )

        # Formatear datos
        lecturas_data = []
        for lectura in lecturas:
            lecturas_data.append(
                {
                    "id": lectura.id,
                    "ronda_id": lectura.ronda.id,
                    "equipo_id": equipo_id,
                    "equipo_nombre": equipo.nombre_equipo,
                    "parametro_id": parametro_id,
                    "parametro_nombre": parametro.nombre,
                    "parametro_unidad": parametro.unidad,
                    "valor_medido": float(lectura.valor),
                    "valor_minimo": lectura.valor_minimo,
                    "valor_maximo": lectura.valor_maximo,
                    "fecha_ronda": lectura.ronda.tomado_en.isoformat(),
                    "tomado_por": lectura.ronda.tomado_por,
                    "observaciones": lectura.ronda.observaciones,
                    "buque_id": equipo.buque.id if equipo.buque else None,
                    "buque_nombre": equipo.buque.nombre if equipo.buque else None,
                }
            )

        return Response(
            {
                "equipo_id": equipo_id,
                "equipo_nombre": equipo.nombre_equipo,
                "parametro_id": parametro_id,
                "parametro_nombre": parametro.nombre,
                "total_lecturas": len(lecturas_data),
                "lecturas": lecturas_data,
            },
            status=200,
        )

    except Exception as e:
        return Response({"error": f"Error al obtener lecturas: {str(e)}"}, status=500)


@api_view(["GET"])
def api_rondas_equipos_parametros(request):
    """
    Endpoint que muestra qué equipos han tenido rondas, con qué parámetros y a qué buque pertenecen.
    Retorna información detallada de las relaciones entre equipos, parámetros, rondas y buques.
    """

    # Consulta detallada con todas las lecturas
    lecturas_detalladas = RondaLectura.objects.select_related(
        "ronda__equipo__buque",
        "ronda__equipo__grupo",
        "ronda__equipo__subgrupo",
        "ronda__equipo__sistema",
        "ronda__equipo__subsistema",
        "parametro",
    ).order_by(
        "ronda__equipo__buque__nombre",
        "ronda__equipo__nombre_equipo",
        "-ronda__tomado_en",
        "parametro__nombre",
    )

    # Consulta resumida (sin duplicados por ronda)
    resumen = (
        RondaLectura.objects.select_related("ronda__equipo__buque", "parametro")
        .values(
            "ronda__equipo__id",
            "ronda__equipo__nombre_equipo",
            "ronda__equipo__buque__id",
            "ronda__equipo__buque__nombre",
            "ronda__equipo__buque__tipo",
            "parametro__id",
            "parametro__nombre",
            "parametro__unidad",
        )
        .annotate(
            total_lecturas=Count("id"),
            primera_ronda=Min("ronda__tomado_en"),
            ultima_ronda=Max("ronda__tomado_en"),
        )
        .order_by(
            "ronda__equipo__buque__nombre",
            "ronda__equipo__nombre_equipo",
            "parametro__nombre",
        )
    )

    # Formatear datos detallados
    lecturas_data = []
    for lectura in lecturas_detalladas:
        lecturas_data.append(
            {
                "equipo_id": lectura.ronda.equipo.id,
                "equipo_nombre": lectura.ronda.equipo.nombre_equipo,
                "buque_id": (
                    lectura.ronda.equipo.buque.id
                    if lectura.ronda.equipo.buque
                    else None
                ),
                "buque_nombre": (
                    lectura.ronda.equipo.buque.nombre
                    if lectura.ronda.equipo.buque
                    else None
                ),
                "buque_tipo": (
                    lectura.ronda.equipo.buque.tipo
                    if lectura.ronda.equipo.buque
                    else None
                ),
                "parametro_id": lectura.parametro.id,
                "parametro_nombre": lectura.parametro.nombre,
                "parametro_unidad": lectura.parametro.unidad,
                "ronda_id": lectura.ronda.id,
                "fecha_ronda": lectura.ronda.tomado_en.isoformat(),
                "tomado_por": lectura.ronda.tomado_por,
                "observaciones": lectura.ronda.observaciones,
                "valor_medido": float(lectura.valor),
                "valor_minimo": lectura.valor_minimo,
                "valor_maximo": lectura.valor_maximo,
                "grupo_numero": lectura.ronda.equipo.grupo.numero_de_referencia,
                "grupo_descripcion": lectura.ronda.equipo.grupo.descripcion,
                "subgrupo_numero": lectura.ronda.equipo.subgrupo.numero_de_referencia,
                "subgrupo_descripcion": lectura.ronda.equipo.subgrupo.descripcion,
                "sistema_numero": (
                    lectura.ronda.equipo.sistema.numero_de_referencia
                    if lectura.ronda.equipo.sistema
                    else None
                ),
                "sistema_descripcion": (
                    lectura.ronda.equipo.sistema.descripcion
                    if lectura.ronda.equipo.sistema
                    else None
                ),
                "subsistema_numero": (
                    lectura.ronda.equipo.subsistema.numero_de_referencia
                    if lectura.ronda.equipo.subsistema
                    else None
                ),
                "subsistema_descripcion": (
                    lectura.ronda.equipo.subsistema.descripcion
                    if lectura.ronda.equipo.subsistema
                    else None
                ),
            }
        )

    # Formatear datos resumidos
    resumen_data = []
    for item in resumen:
        resumen_data.append(
            {
                "equipo_id": item["ronda__equipo__id"],
                "equipo_nombre": item["ronda__equipo__nombre_equipo"],
                "buque_id": item["ronda__equipo__buque__id"],
                "buque_nombre": item["ronda__equipo__buque__nombre"],
                "buque_tipo": item["ronda__equipo__buque__tipo"],
                "parametro_id": item["parametro__id"],
                "parametro_nombre": item["parametro__nombre"],
                "parametro_unidad": item["parametro__unidad"],
                "total_lecturas": item["total_lecturas"],
                "primera_ronda": (
                    item["primera_ronda"].isoformat() if item["primera_ronda"] else None
                ),
                "ultima_ronda": (
                    item["ultima_ronda"].isoformat() if item["ultima_ronda"] else None
                ),
            }
        )

    return Response(
        {
            "lecturas_detalladas": lecturas_data,
            "resumen_equipos_parametros": resumen_data,
            "total_lecturas": len(lecturas_data),
            "total_combinaciones": len(resumen_data),
        },
        status=200,
    )


@api_view(["POST"])
def api_generate_test_data(request):
    """
    Endpoint para generar 5 lecturas de prueba para el parámetro 4 (Presión aire de carga)
    en el equipo 3 (EQUIPO PRUEBA 3) del buque 1 (Bote Insular de Dimar)
    """
    try:
        # Obtener el equipo y parámetro
        equipo = get_object_or_404(Equipo, id=3)
        parametro = get_object_or_404(Parametro, id=4)

        # Generar 5 valores aleatorios para presión de aire de carga
        import random

        valores_prueba = []
        for i in range(5):
            # Generar valores entre 1.5 y 4.5 BAR (rango realista)
            valor = round(random.uniform(1.5, 4.5), 1)
            valores_prueba.append(valor)

        rondas_creadas = []
        lecturas_creadas = []

        with transaction.atomic():
            for i, valor in enumerate(valores_prueba):
                # Crear una nueva ronda
                ronda = Ronda.objects.create(
                    equipo=equipo,
                    buque=equipo.buque,
                    tomado_en=timezone.now(),
                    observaciones=f"Datos de prueba generados automáticamente - Lectura {i+1}",
                    tomado_por="Sistema de Prueba",
                )
                rondas_creadas.append(ronda.id)

                # Crear la lectura para esta ronda
                lectura = RondaLectura.objects.create(
                    ronda=ronda,
                    parametro=parametro,
                    valor=valor,
                    unidad=parametro.unidad or "BAR",
                    valor_minimo=parametro.valor_minimo,
                    valor_maximo=parametro.valor_maximo,
                )
                lecturas_creadas.append(
                    {
                        "id": lectura.id,
                        "valor": float(valor),
                        "ronda_id": ronda.id,
                        "fecha": ronda.tomado_en.isoformat(),
                    }
                )

        return Response(
            {
                "message": "Datos de prueba generados exitosamente",
                "rondas_creadas": len(rondas_creadas),
                "lecturas_creadas": len(lecturas_creadas),
                "valores": valores_prueba,
                "detalles": lecturas_creadas,
            },
            status=201,
        )

    except Exception as e:
        return Response(
            {"error": f"Error generando datos de prueba: {str(e)}"}, status=500
        )


@api_view(["POST"])
def api_generate_test_data_batch(request):
    """
    Endpoint para generar datos de prueba para múltiples equipos y parámetros activos
    Recibe una lista de equipos con sus parámetros activos
    """
    try:
        data = request.data
        equipos_parametros = data.get("equipos_parametros", [])

        if not equipos_parametros:
            return Response(
                {"error": "Se requiere la lista equipos_parametros"}, status=400
            )

        import random
        from datetime import datetime, timedelta

        rondas_creadas = []
        lecturas_creadas = []
        total_lecturas = 0

        with transaction.atomic():
            for item in equipos_parametros:
                equipo_id = item.get("equipo_id")
                parametros_ids = item.get("parametros_ids", [])

                try:
                    equipo = get_object_or_404(Equipo, id=equipo_id)

                    for parametro_id in parametros_ids:
                        try:
                            parametro = get_object_or_404(Parametro, id=parametro_id)

                            # Generar valor aleatorio dentro del rango del parámetro
                            min_val = float(parametro.valor_minimo or 0)
                            max_val = float(parametro.valor_maximo or 100)

                            # Generar valor con 80% de probabilidad dentro del rango normal
                            # y 20% de probabilidad fuera del rango (para generar alertas)
                            if random.random() < 0.8:
                                # Valor normal (dentro del rango)
                                valor = round(random.uniform(min_val, max_val), 2)
                            else:
                                # Valor anómalo (fuera del rango)
                                if random.choice([True, False]):
                                    # Por encima del máximo
                                    valor = round(
                                        random.uniform(max_val, max_val * 1.5), 2
                                    )
                                else:
                                    # Por debajo del mínimo
                                    valor = round(
                                        random.uniform(min_val * 0.5, min_val), 2
                                    )

                            # Crear ronda
                            ronda = Ronda.objects.create(
                                equipo=equipo,
                                buque=equipo.buque,
                                tomado_en=timezone.now(),
                                observaciones=f"Datos de prueba automáticos - {parametro.nombre}",
                                tomado_por="Sistema de Prueba Batch",
                            )
                            rondas_creadas.append(ronda.id)

                            # Crear lectura
                            lectura = RondaLectura.objects.create(
                                ronda=ronda,
                                parametro=parametro,
                                valor=valor,
                                unidad=parametro.unidad or "",
                                valor_minimo=parametro.valor_minimo,
                                valor_maximo=parametro.valor_maximo,
                            )

                            lecturas_creadas.append(
                                {
                                    "lectura_id": lectura.id,
                                    "ronda_id": ronda.id,
                                    "equipo_id": equipo.id,
                                    "equipo_nombre": equipo.nombre_equipo,
                                    "parametro_id": parametro.id,
                                    "parametro_nombre": parametro.nombre,
                                    "valor": float(valor),
                                    "unidad": parametro.unidad or "",
                                    "fecha": ronda.tomado_en.isoformat(),
                                }
                            )
                            total_lecturas += 1

                        except Exception as e:
                            print(f"Error procesando parámetro {parametro_id}: {e}")
                            continue

                except Exception as e:
                    print(f"Error procesando equipo {equipo_id}: {e}")
                    continue

        return Response(
            {
                "message": "Datos de prueba batch generados exitosamente",
                "equipos_procesados": len(
                    [item for item in equipos_parametros if item.get("equipo_id")]
                ),
                "rondas_creadas": len(rondas_creadas),
                "lecturas_creadas": total_lecturas,
                "detalles": lecturas_creadas,
            },
            status=201,
        )

    except Exception as e:
        return Response(
            {"error": f"Error generando datos de prueba batch: {str(e)}"}, status=500
        )


@api_view(["POST"])
def api_generate_test_data_single(request):
    """
    Endpoint para generar una sola lectura de prueba para un equipo y parámetro específico
    """
    try:
        data = request.data
        equipo_id = data.get("equipo_id")
        parametro_id = data.get("parametro_id")

        if not equipo_id or not parametro_id:
            return Response(
                {"error": "Se requieren equipo_id y parametro_id"}, status=400
            )

        import random

        try:
            equipo = get_object_or_404(Equipo, id=equipo_id)
            parametro = get_object_or_404(Parametro, id=parametro_id)

            # Generar valor aleatorio dentro del rango del parámetro
            min_val = float(parametro.valor_minimo or 0)
            max_val = float(parametro.valor_maximo or 100)

            # Generar valor con 80% de probabilidad dentro del rango normal
            # y 20% de probabilidad fuera del rango (para generar alertas)
            if random.random() < 0.8:
                # Valor normal (dentro del rango)
                valor = round(random.uniform(min_val, max_val), 2)
            else:
                # Valor anómalo (fuera del rango)
                if random.choice([True, False]):
                    # Por encima del máximo
                    valor = round(random.uniform(max_val, max_val * 1.5), 2)
                else:
                    # Por debajo del mínimo
                    valor = round(random.uniform(min_val * 0.5, min_val), 2)

            with transaction.atomic():
                # Crear ronda
                ronda = Ronda.objects.create(
                    equipo=equipo,
                    buque=equipo.buque,
                    tomado_en=timezone.now(),
                    observaciones=f"Dato tiempo real - {parametro.nombre}",
                    tomado_por="Sistema Tiempo Real",
                )

                # Crear lectura
                lectura = RondaLectura.objects.create(
                    ronda=ronda,
                    parametro=parametro,
                    valor=valor,
                    unidad=parametro.unidad or "",
                    valor_minimo=parametro.valor_minimo,
                    valor_maximo=parametro.valor_maximo,
                )

            return Response(
                {
                    "message": "Lectura individual generada exitosamente",
                    "lectura": {
                        "lectura_id": lectura.id,
                        "ronda_id": ronda.id,
                        "equipo_id": equipo.id,
                        "equipo_nombre": equipo.nombre_equipo,
                        "parametro_id": parametro.id,
                        "parametro_nombre": parametro.nombre,
                        "valor": float(valor),
                        "unidad": parametro.unidad or "",
                        "fecha": ronda.tomado_en.isoformat(),
                    },
                },
                status=201,
            )

        except Exception as e:
            return Response(
                {"error": f"Error procesando lectura: {str(e)}"}, status=500
            )

    except Exception as e:
        return Response(
            {"error": f"Error generando lectura individual: {str(e)}"}, status=500
        )
