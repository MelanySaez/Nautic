"""
Búsqueda de inspecciones: registro declarativo de filtros + paginación por cursor.

Cada criterio de búsqueda es una entrada de ``FILTROS`` (un ``Filtro``) con su
nombre de parámetro, su parser y la función que lo aplica al queryset. Agregar
un criterio nuevo es agregar una entrada; ni la vista ni ``buscar_inspecciones``
cambian. ``describir_filtros()`` expone el mismo registro como datos, para que un
intérprete de lenguaje natural futuro pueda derivar el esquema de búsqueda sin
tocar el código de consulta.

Contrato de la lista:
  - Todos los filtros se combinan con AND.
  - Los parámetros desconocidos se IGNORAN (no producen 400), de modo que
    clientes nuevos y viejos puedan convivir.
  - Los errores se acumulan por campo y se devuelven juntos
    (``BusquedaInvalida.errores``).
  - Orden fijo ``-fecha_creacion, -id`` y paginación keyset (cursor opaco); no
    hay ``total`` porque contarlo cuesta lo que se quiere evitar.
"""
import base64
import binascii
import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any, Callable, Optional

from django.conf import settings
from django.db.models import Count, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce
from django.utils import timezone

from .models import FotoInspeccion, InspeccionCasco, NivelSeveridad

LIMIT_POR_DEFECTO = 20
LIMIT_MAXIMO = 100

_Q_MIN = 2
_Q_MAX = 100
_ID_MAXIMO = 2**63 - 1
_CURSOR_MAX_LONGITUD = 200
_RE_FECHA = re.compile(r'^\d{4}-\d{2}-\d{2}$')


class BusquedaInvalida(Exception):
    """Parámetros inválidos. ``errores`` mapea campo -> [mensajes]."""

    def __init__(self, errores):
        super().__init__('Parámetros de búsqueda inválidos.')
        self.errores = errores


class ValorInvalido(ValueError):
    """Lanzada por un parser con el mensaje (en español) para el cliente."""


@dataclass(frozen=True)
class Filtro:
    nombre: str                                  # parámetro de query string
    tipo: str                                    # 'entero' | 'fecha' | 'enum' | 'texto'
    descripcion: str
    parsear: Callable[[str], Any]                # str -> valor, o lanza ValorInvalido
    aplicar: Callable[[Any, Any], Any]           # (queryset, valor) -> queryset
    valores: Optional[tuple] = None              # valores permitidos (enum)
    formato: Optional[str] = None                # p. ej. 'YYYY-MM-DD'
    alias: tuple = ()                            # nombres alternativos del parámetro

    def describir(self):
        return {
            'nombre': self.nombre,
            'tipo': self.tipo,
            'descripcion': self.descripcion,
            'valores': list(self.valores) if self.valores else None,
            'formato': self.formato,
            'alias': list(self.alias),
        }


# ─────────────────────────────────────────────────────────────────────────────
# Parsers
# ─────────────────────────────────────────────────────────────────────────────

def _parsear_entero_positivo(raw):
    raw = raw.strip()
    if not (raw.isascii() and raw.isdigit()) or len(raw) > 18:
        raise ValorInvalido('Debe ser un entero positivo.')
    numero = int(raw)
    if numero < 1:
        raise ValorInvalido('Debe ser un entero positivo.')
    return numero


def _parsear_fecha(raw):
    raw = raw.strip()
    # fromisoformat() también acepta 'YYYYMMDD' y semanas ISO: se exige YYYY-MM-DD.
    if not _RE_FECHA.match(raw):
        raise ValorInvalido('Debe ser una fecha con formato AAAA-MM-DD.')
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise ValorInvalido('Fecha inexistente. Use el formato AAAA-MM-DD.')


def _parsear_severidad(raw):
    nivel = NivelSeveridad.desde_texto(raw.strip().lower())
    if nivel is None:
        permitidos = ', '.join(n.label for n in NivelSeveridad)
        raise ValorInvalido(f'Debe ser uno de: {permitidos}.')
    return nivel


def _parsear_texto(raw):
    texto = raw.strip()
    if not (_Q_MIN <= len(texto) <= _Q_MAX):
        raise ValorInvalido(f'Debe tener entre {_Q_MIN} y {_Q_MAX} caracteres.')
    return texto


# ─────────────────────────────────────────────────────────────────────────────
# Aplicadores
# ─────────────────────────────────────────────────────────────────────────────

def _inicio_del_dia(dia):
    momento = datetime.combine(dia, time.min)
    return timezone.make_aware(momento) if settings.USE_TZ else momento


def _aplicar_desde(qs, dia):
    return qs.filter(fecha_creacion__gte=_inicio_del_dia(dia))


def _aplicar_hasta(qs, dia):
    # Inclusivo: todo el día `hasta`, es decir, estrictamente antes de su día siguiente.
    try:
        siguiente = dia + timedelta(days=1)
    except OverflowError:
        return qs
    return qs.filter(fecha_creacion__lt=_inicio_del_dia(siguiente))


FILTROS = {
    f.nombre: f
    for f in (
        Filtro(
            nombre='buque',
            tipo='entero',
            descripcion='ID del buque.',
            parsear=_parsear_entero_positivo,
            aplicar=lambda qs, valor: qs.filter(buque_id=valor),
            alias=('buque_id',),
        ),
        Filtro(
            nombre='desde',
            tipo='fecha',
            descripcion='Inspecciones creadas desde este día (inclusive).',
            parsear=_parsear_fecha,
            aplicar=_aplicar_desde,
            formato='YYYY-MM-DD',
        ),
        Filtro(
            nombre='hasta',
            tipo='fecha',
            descripcion='Inspecciones creadas hasta este día (inclusive, día completo).',
            parsear=_parsear_fecha,
            aplicar=_aplicar_hasta,
            formato='YYYY-MM-DD',
        ),
        Filtro(
            nombre='severidad_min',
            tipo='enum',
            descripcion='Severidad máxima de la inspección igual o superior a este nivel.',
            parsear=_parsear_severidad,
            aplicar=lambda qs, nivel: qs.filter(severidad_max__gte=nivel),
            valores=tuple(n.label for n in NivelSeveridad),
        ),
        Filtro(
            nombre='q',
            tipo='texto',
            descripcion=(
                f'Texto contenido en el nombre ({_Q_MIN}-{_Q_MAX} caracteres, '
                'sin distinguir mayúsculas).'
            ),
            parsear=_parsear_texto,
            aplicar=lambda qs, texto: qs.filter(nombre__icontains=texto),
        ),
    )
}


def describir_filtros():
    """Descripción JSON-serializable del registro (para derivar un esquema NL)."""
    return {
        'filtros': [f.describir() for f in FILTROS.values()],
        'paginacion': {
            'limit': {'tipo': 'entero', 'minimo': 1, 'maximo': LIMIT_MAXIMO, 'defecto': LIMIT_POR_DEFECTO},
            'cursor': {'tipo': 'texto', 'descripcion': 'Valor `siguiente` de la página anterior.'},
        },
        'orden': ['-fecha_creacion', '-id'],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Validaciones entre campos
# ─────────────────────────────────────────────────────────────────────────────

def _validar_rango_fechas(valores):
    desde, hasta = valores.get('desde'), valores.get('hasta')
    if desde and hasta and desde > hasta:
        return {'desde': ['No puede ser posterior a "hasta".']}
    return {}


_VALIDACIONES_CRUZADAS = (_validar_rango_fechas,)


# ─────────────────────────────────────────────────────────────────────────────
# Cursor (keyset)
# ─────────────────────────────────────────────────────────────────────────────

def codificar_cursor(fecha, pk):
    crudo = f'{fecha.isoformat()}|{pk}'
    return base64.urlsafe_b64encode(crudo.encode('ascii')).decode('ascii')


def decodificar_cursor(cursor):
    """Devuelve (fecha, pk) o lanza ValorInvalido."""
    mensaje = 'Cursor inválido.'
    if len(cursor) > _CURSOR_MAX_LONGITUD:
        raise ValorInvalido(mensaje)
    try:
        crudo = base64.urlsafe_b64decode(cursor.encode('ascii')).decode('ascii')
        marca, pk_txt = crudo.rsplit('|', 1)
        fecha = datetime.fromisoformat(marca)
        pk = int(pk_txt)
    except (ValueError, UnicodeError, binascii.Error):
        raise ValorInvalido(mensaje)
    if not (0 <= pk <= _ID_MAXIMO) or timezone.is_aware(fecha) != bool(settings.USE_TZ):
        raise ValorInvalido(mensaje)
    return fecha, pk


# ─────────────────────────────────────────────────────────────────────────────
# Búsqueda
# ─────────────────────────────────────────────────────────────────────────────

def _leer_parametro(params, filtro):
    for nombre in (filtro.nombre, *filtro.alias):
        valor = params.get(nombre)
        if valor is not None:
            return nombre, valor
    return filtro.nombre, None


def _parsear_limit(raw):
    if raw is None:
        return LIMIT_POR_DEFECTO
    raw = raw.strip()
    if not (raw.isascii() and raw.isdigit()) or len(raw) > 6 or not (1 <= int(raw) <= LIMIT_MAXIMO):
        raise ValorInvalido(f'Debe ser un entero entre 1 y {LIMIT_MAXIMO}.')
    return int(raw)


def _con_total_fotos(qs):
    """Anota el conteo de fotos (subquery) para no hacer una consulta por fila."""
    fotos = (
        FotoInspeccion.objects.filter(inspeccion_id=OuterRef('pk'))
        .order_by().values('inspeccion_id').annotate(n=Count('pk')).values('n')
    )
    return qs.annotate(n_fotos=Coalesce(Subquery(fotos), 0))


def buscar_inspecciones(params):
    """
    Busca inspecciones según ``params`` (un QueryDict o dict de strings).

    Devuelve ``(pagina, siguiente_cursor, hay_mas)``. Lanza ``BusquedaInvalida``
    con los errores de todos los campos inválidos.
    """
    errores = {}
    valores = {}
    qs = InspeccionCasco.objects.select_related('buque')

    for filtro in FILTROS.values():
        nombre, raw = _leer_parametro(params, filtro)
        if raw is None:
            continue
        try:
            valores[filtro.nombre] = filtro.parsear(raw)
        except ValorInvalido as exc:
            errores[nombre] = [str(exc)]

    for validar in _VALIDACIONES_CRUZADAS:
        for campo, mensajes in validar(valores).items():
            errores.setdefault(campo, mensajes)

    try:
        limit = _parsear_limit(params.get('limit'))
    except ValorInvalido as exc:
        errores['limit'] = [str(exc)]

    ancla = None
    cursor = params.get('cursor')
    if cursor:
        try:
            ancla = decodificar_cursor(cursor)
        except ValorInvalido as exc:
            errores['cursor'] = [str(exc)]

    if errores:
        raise BusquedaInvalida(errores)

    for nombre, valor in valores.items():
        qs = FILTROS[nombre].aplicar(qs, valor)

    if ancla:
        fecha, pk = ancla
        qs = qs.filter(Q(fecha_creacion__lt=fecha) | Q(fecha_creacion=fecha, id__lt=pk))

    qs = _con_total_fotos(qs).order_by('-fecha_creacion', '-id')
    # Una fila de más indica si hay otra página sin hacer COUNT.
    filas = list(qs[:limit + 1])
    hay_mas = len(filas) > limit
    pagina = filas[:limit]
    siguiente = codificar_cursor(pagina[-1].fecha_creacion, pagina[-1].id) if hay_mas else None
    return pagina, siguiente, hay_mas
