"""
PDF inspection report.

``datos_reporte`` gathers everything the report shows from the stored data
(no new fields); ``generar_pdf`` lays it out with ReportLab. Photos are read
through the storage helpers and downscaled, and a photo that cannot be read is
listed without its image instead of failing the whole report.
"""
import io
import logging
from xml.sax.saxutils import escape

from django.utils import timezone
from PIL import Image as ImagenPil
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

from .almacenamiento import leer_archivo
from .models import FotoInspeccion, NivelSeveridad, ReporteInspeccion
from .taxonomia import TIPO_COMPONENTE, info_clase

logger = logging.getLogger(__name__)

# --- Data -----------------------------------------------------------------

_FICHA_BUQUE = (
    ('Eslora total', 'eslora_total_m', 'm'),
    ('Manga moldeada', 'manga_moldeada_m', 'm'),
    ('Calado de diseño', 'calado_diseno_m', 'm'),
    ('Desplazamiento', 'desplazamiento_ton', 'ton'),
)

_PEORES_SECCIONES = 3


def _nivel(severidad):
    """Sort key: higher is worse; unknown or missing severity sorts last."""
    return NivelSeveridad.desde_texto(severidad) or 0


def _peor(*severidades):
    peor = max(severidades, key=_nivel, default=None)
    return peor if _nivel(peor) else None


def _hallazgos(foto):
    """Anomalies of one photo (its ``DeteccionFoto`` rows except known components), with taxonomy.

    ``descartado`` marks the classes the inspector dismissed as false positives.
    Uses the prefetched rows when the queryset prefetched ``detecciones``.
    """
    hallazgos = []
    for fila in foto.detecciones.all():
        info = info_clase(fila.clase)
        if info['tipo'] == TIPO_COMPONENTE:
            continue
        hallazgos.append({
            'clase': fila.clase,
            'etiqueta': info['etiqueta'],
            'severidad': info['severidad'],
            'total': fila.cantidad,
            'confianza_max': fila.confianza_max,
            'descartado': fila.descartada,
        })
    return hallazgos


def clases_anomalia(foto):
    """Class names of a photo's anomalies: the only ones the inspector can discard."""
    return {h['clase'] for h in _hallazgos(foto)}


def _acumular(acumulado, hallazgos):
    """Merge per-photo findings into per-class totals (sum of counts, max confidence)."""
    for h in hallazgos:
        actual = acumulado.get(h['clase'])
        if actual is None:
            acumulado[h['clase']] = {k: v for k, v in h.items() if k != 'descartado'}
            continue
        actual['total'] += h['total']
        confianzas = [c for c in (actual['confianza_max'], h['confianza_max']) if c is not None]
        actual['confianza_max'] = max(confianzas) if confianzas else None


def _ordenar_hallazgos(por_clase):
    return sorted(por_clase.values(), key=lambda h: (-_nivel(h['severidad']), -h['total'], h['etiqueta']))


def _seccion_ref(seccion):
    return {'codigo': seccion.codigo, 'nombre': seccion.nombre}


def borrador_de(inspeccion):
    """The inspection's ``ReporteInspeccion`` or None when it was never saved."""
    try:
        return inspeccion.reporte
    except ReporteInspeccion.DoesNotExist:
        return None


def fotos_revisables(inspeccion):
    """Analyzed photos with at least one anomaly, each with its findings (and their review)."""
    fotos = (inspeccion.fotos.filter(estado=FotoInspeccion.Estado.COMPLETADA)
             .select_related('seccion').prefetch_related('detecciones').order_by('fecha_creacion', 'id'))
    revisables = []
    for foto in fotos:
        hallazgos = _hallazgos(foto)
        if hallazgos:
            revisables.append((foto, sorted(
                hallazgos, key=lambda h: (-_nivel(h['severidad']), -h['total'], h['etiqueta']))))
    return revisables


_CAMPOS_BORRADOR = ('conclusion', 'observaciones', 'recomendaciones', 'inspector_nombre', 'inspector_cargo')


def textos_reporte(inspeccion, borrador=None):
    """The draft's texts, with the inspector name defaulting to who took the inspection.

    The name is known since the inspection was created, so the editor shows it
    filled in; a saved name replaces it, and clearing it falls back again.
    """
    textos = {campo: getattr(borrador, campo) if borrador else '' for campo in _CAMPOS_BORRADOR}
    textos['inspector_nombre'] = textos['inspector_nombre'] or inspeccion.tomado_por
    return textos


def datos_reporte(inspeccion):
    """Everything the report shows, from the stored data plus the inspector's draft.

    Findings the inspector discarded are left out of every count, severity and
    of the photo evidence.
    """
    buque = inspeccion.buque
    borrador = borrador_de(inspeccion)
    fotos = list(inspeccion.fotos.select_related('seccion').prefetch_related('detecciones')
                 .order_by('fecha_creacion', 'id'))
    analizadas = [f for f in fotos if f.estado == FotoInspeccion.Estado.COMPLETADA]

    anomalias = {}
    por_seccion = {}
    evidencia = []
    descartados = 0
    for foto in analizadas:
        todos = _hallazgos(foto)
        descartados += sum(h['descartado'] for h in todos)
        hallazgos = [h for h in todos if not h['descartado']]
        severidad = _peor(*(h['severidad'] for h in hallazgos))
        _acumular(anomalias, hallazgos)
        fila = por_seccion.setdefault(foto.seccion_id, {
            **_seccion_ref(foto.seccion), 'orden': foto.seccion.orden,
            'fotos': 0, 'severidad': None, 'por_clase': {},
        })
        fila['fotos'] += 1
        fila['severidad'] = _peor(fila['severidad'], severidad)
        _acumular(fila['por_clase'], hallazgos)
        if hallazgos:
            evidencia.append({
                'foto_id': foto.id,
                'seccion': _seccion_ref(foto.seccion),
                'severidad': severidad,
                'clave_imagen': foto.imagen_anotada or foto.imagen_original,
                'hallazgos': _ordenar_hallazgos({h['clase']: h for h in hallazgos}),
                'nota': foto.nota_inspector,
                'con_descartes': any(h['descartado'] for h in todos),
            })

    secciones = sorted(por_seccion.values(), key=lambda s: (-_nivel(s['severidad']), s['orden'], s['codigo']))
    for fila in secciones:
        fila['hallazgos'] = _ordenar_hallazgos(fila.pop('por_clase'))
        fila.pop('orden')

    secciones_buque = list(buque.secciones.all())
    no_inspeccionadas = [_seccion_ref(s) for s in secciones_buque if s.id not in por_seccion]

    modelos = sorted({(f.modelo_id, f.modelo_version) for f in analizadas if f.modelo_id},
                     key=lambda m: (m[0], m[1] or ''))
    textos = textos_reporte(inspeccion, borrador)

    return {
        'inspeccion': {
            'id': inspeccion.id,
            'codigo': 'INS-%04d' % inspeccion.id,
            'nombre': inspeccion.nombre,
            'descripcion': inspeccion.descripcion,
            'tomado_por': textos['inspector_nombre'],
            'cargo': textos['inspector_cargo'],
            'fecha': inspeccion.fecha_creacion,
        },
        'buque': {
            'nombre': buque.nombre,
            'tipo': buque.tipo,
            'etapa': buque.etapa,
            'ficha': [(etiqueta, getattr(buque, campo), unidad) for etiqueta, campo, unidad in _FICHA_BUQUE],
        },
        'resumen': {
            'severidad_max': _peor(*(a['severidad'] for a in anomalias.values())),
            'fotos_total': len(fotos),
            'fotos_analizadas': len(analizadas),
            'fotos_error': sum(f.estado == FotoInspeccion.Estado.ERROR for f in fotos),
            'fotos_pendientes': sum(
                f.estado in (FotoInspeccion.Estado.PENDIENTE, FotoInspeccion.Estado.EN_PROCESO) for f in fotos
            ),
            'anomalias': _ordenar_hallazgos(anomalias),
            'peores_secciones': [
                {'codigo': s['codigo'], 'nombre': s['nombre'], 'severidad': s['severidad']}
                for s in secciones if s['severidad']
            ][:_PEORES_SECCIONES],
            'cobertura': {'inspeccionadas': len(por_seccion), 'total': len(secciones_buque)},
        },
        'secciones': secciones,
        'evidencia': evidencia,
        'no_inspeccionadas': no_inspeccionadas,
        'metodologia': {
            'modelos': [{'modelo': m, 'version': v} for m, v in modelos],
            'taxonomias': sorted({f.taxonomia_version for f in analizadas if f.taxonomia_version}),
            'revision': {'revisado': borrador is not None, 'descartados': descartados},
        },
        'borrador': textos,
    }


# --- Layout ---------------------------------------------------------------

_ETIQUETA_SEVERIDAD = {'critical': 'Crítica', 'high': 'Alta', 'medium': 'Media', 'low': 'Baja'}
_COLOR_SEVERIDAD = {
    'critical': colors.HexColor('#B42318'),
    'high': colors.HexColor('#C4320A'),
    'medium': colors.HexColor('#B54708'),
    'low': colors.HexColor('#175CD3'),
}
_TINTA = colors.HexColor('#101828')
_TENUE = colors.HexColor('#667085')
_LINEA = colors.HexColor('#D0D5DD')
_FONDO = colors.HexColor('#F2F4F7')
_ACENTO = colors.HexColor('#0B4A6F')

_ANCHO_UTIL = A4[0] - 36 * mm
_LADO_IMAGEN_PX = 1000
_ANCHO_IMAGEN = 78 * mm
_ALTO_IMAGEN_MAX = 70 * mm


def _estilos():
    base = getSampleStyleSheet()
    return {
        'titulo': ParagraphStyle('titulo', parent=base['Title'], fontSize=20, leading=24,
                                 textColor=_TINTA, alignment=0, spaceAfter=2),
        'subtitulo': ParagraphStyle('subtitulo', parent=base['Normal'], fontSize=10, textColor=_TENUE),
        'h2': ParagraphStyle('h2', parent=base['Heading2'], fontSize=13, leading=16, textColor=_ACENTO,
                             spaceBefore=10, spaceAfter=6),
        'texto': ParagraphStyle('texto', parent=base['Normal'], fontSize=9.5, leading=13, textColor=_TINTA),
        'tenue': ParagraphStyle('tenue', parent=base['Normal'], fontSize=8.5, leading=11, textColor=_TENUE),
        'celda': ParagraphStyle('celda', parent=base['Normal'], fontSize=9, leading=11.5, textColor=_TINTA),
        'cifra': ParagraphStyle('cifra', parent=base['Normal'], fontSize=16, leading=19, textColor=_TINTA,
                                alignment=TA_CENTER),
        'cifra_tenue': ParagraphStyle('cifra_tenue', parent=base['Normal'], fontSize=8, leading=10,
                                      textColor=_TENUE, alignment=TA_CENTER),
    }


def _txt(valor):
    """Escape user text for Paragraph markup; blank becomes a dash."""
    texto = (valor or '').strip() if isinstance(valor, str) else valor
    return escape(str(texto)) if texto not in (None, '') else '—'


def _multilinea(valor):
    """Escaped user text keeping its line breaks."""
    return '<br/>'.join(escape(linea) for linea in valor.strip().splitlines())


def _fecha(valor):
    """dd/mm/yyyy hh:mm; works with naive datetimes (USE_TZ=False) and aware ones."""
    if timezone.is_aware(valor):
        valor = timezone.localtime(valor)
    return valor.strftime('%d/%m/%Y %H:%M')


def _num(valor, decimales=2):
    if valor is None:
        return '—'
    texto = f'{valor:,.{decimales}f}'.rstrip('0').rstrip('.') if isinstance(valor, float) else f'{valor:,}'
    return texto.replace(',', ' ').replace('.', ',')


def _pct(valor):
    return '—' if valor is None else f'{round(valor * 100)} %'


def _severidad(sev, negrita=True):
    if not sev:
        return '<font color="#667085">Sin anomalías</font>'
    color = _COLOR_SEVERIDAD.get(sev, _TINTA).hexval()[2:]
    etiqueta = _ETIQUETA_SEVERIDAD.get(sev, sev)
    return f'<font color="#{color}">{"<b>" if negrita else ""}{etiqueta}{"</b>" if negrita else ""}</font>'


def _tabla(filas, anchos, encabezado=True):
    tabla = Table(filas, colWidths=anchos, repeatRows=1 if encabezado else 0)
    estilo = [
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LINEBELOW', (0, 0), (-1, -1), 0.4, _LINEA),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]
    if encabezado:
        estilo += [('BACKGROUND', (0, 0), (-1, 0), _FONDO), ('LINEBELOW', (0, 0), (-1, 0), 0.8, _TENUE)]
    tabla.setStyle(TableStyle(estilo))
    return tabla


def _imagen(clave):
    """Downscaled JPEG flowable for a stored photo, or None when it cannot be read."""
    try:
        with ImagenPil.open(io.BytesIO(leer_archivo(clave))) as original:
            # Downscale before converting: JPEGs decode straight at a reduced scale
            # (draft), so a 24 MP photo never allocates its full-resolution RGB copy.
            original.draft('RGB', (_LADO_IMAGEN_PX, _LADO_IMAGEN_PX))
            original.thumbnail((_LADO_IMAGEN_PX, _LADO_IMAGEN_PX))
            imagen = original.convert('RGB')
        salida = io.BytesIO()
        imagen.save(salida, format='JPEG', quality=72, optimize=True)
        salida.seek(0)
    except Exception:
        logger.warning('No se pudo leer la imagen %s para el reporte', clave, exc_info=True)
        return None
    ancho, alto = imagen.size
    escala = min(_ANCHO_IMAGEN / ancho, _ALTO_IMAGEN_MAX / alto)
    return Image(salida, width=ancho * escala, height=alto * escala)


def _encabezado(datos, e):
    insp, buque = datos['inspeccion'], datos['buque']
    fecha = _fecha(insp['fecha'])
    filas = [
        [Paragraph('<b>Buque</b>', e['celda']),
         Paragraph(f"{_txt(buque['nombre'])} · {_txt(buque['tipo'])} · {_txt(buque['etapa'])}", e['celda'])],
        [Paragraph('<b>Fecha</b>', e['celda']), Paragraph(fecha, e['celda'])],
        [Paragraph('<b>Inspector</b>', e['celda']),
         Paragraph(_txt(insp['tomado_por']) + (f" · {_txt(insp['cargo'])}" if insp['cargo'] else ''), e['celda'])],
        [Paragraph('<b>Descripción</b>', e['celda']), Paragraph(_txt(insp['descripcion']), e['celda'])],
    ]
    return [
        Paragraph('Reporte de inspección de casco', e['subtitulo']),
        Paragraph(_txt(insp['nombre']), e['titulo']),
        Paragraph(insp['codigo'], e['subtitulo']),
        Spacer(1, 6),
        _tabla(filas, [32 * mm, _ANCHO_UTIL - 32 * mm], encabezado=False),
    ]


def _resumen(datos, e):
    r = datos['resumen']
    cobertura = r['cobertura']
    cifras = [
        (_severidad(r['severidad_max']) if r['severidad_max'] else '—', 'Severidad máxima'),
        (f"{r['fotos_analizadas']} / {r['fotos_total']}", 'Fotos analizadas'),
        (str(sum(a['total'] for a in r['anomalias'])), 'Anomalías detectadas'),
        (f"{cobertura['inspeccionadas']} de {cobertura['total']}", 'Secciones inspeccionadas'),
    ]
    tarjetas = Table(
        [[Paragraph(valor, e['cifra']) for valor, _ in cifras],
         [Paragraph(etiqueta, e['cifra_tenue']) for _, etiqueta in cifras]],
        colWidths=[_ANCHO_UTIL / 4] * 4,
    )
    tarjetas.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), _FONDO),
        ('LINEAFTER', (0, 0), (-2, -1), 2, colors.white),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('BOTTOMPADDING', (0, -1), (-1, -1), 8),
    ]))
    bloque = [Paragraph('1. Resumen ejecutivo', e['h2']), tarjetas, Spacer(1, 6)]

    avisos = []
    if r['fotos_error']:
        avisos.append(f"{r['fotos_error']} foto(s) no se pudieron analizar.")
    if r['fotos_pendientes']:
        avisos.append(f"{r['fotos_pendientes']} foto(s) seguían pendientes de análisis al generar el reporte.")
    for aviso in avisos:
        bloque.append(Paragraph(aviso, e['tenue']))

    if r['anomalias']:
        filas = [[Paragraph(f'<b>{t}</b>', e['celda']) for t in ('Anomalía', 'Severidad', 'Cantidad', 'Confianza máx.')]]
        filas += [[Paragraph(_txt(a['etiqueta']), e['celda']), Paragraph(_severidad(a['severidad']), e['celda']),
                   Paragraph(str(a['total']), e['celda']), Paragraph(_pct(a['confianza_max']), e['celda'])]
                  for a in r['anomalias']]
        bloque += [Spacer(1, 4), _tabla(filas, [70 * mm, 35 * mm, 30 * mm, _ANCHO_UTIL - 135 * mm])]
    else:
        bloque.append(Paragraph('No se detectaron anomalías en las fotos analizadas.', e['texto']))

    if r['peores_secciones']:
        peores = ', '.join(f"{_txt(s['codigo'])} · {_txt(s['nombre'])} ({_severidad(s['severidad'], False)})"
                           for s in r['peores_secciones'])
        bloque += [Spacer(1, 6), Paragraph(f'<b>Secciones más comprometidas:</b> {peores}', e['texto'])]

    conclusion = datos['borrador']['conclusion']
    if conclusion:
        bloque += [Spacer(1, 6), Paragraph('<b>Conclusión del inspector</b>', e['texto']),
                   Paragraph(_multilinea(conclusion), e['texto'])]
    return bloque


def _ficha(datos, e):
    ficha = datos['buque']['ficha']
    filas = [[Paragraph(f'<b>{etiqueta}</b>', e['celda']),
              Paragraph(f'{_num(valor)} {unidad}' if valor is not None else '—', e['celda'])]
             for etiqueta, valor, unidad in ficha]
    return [Paragraph('2. Datos del buque', e['h2']),
            _tabla(filas, [50 * mm, _ANCHO_UTIL - 50 * mm], encabezado=False)]


def _lista_hallazgos(hallazgos):
    if not hallazgos:
        return '<font color="#667085">Ninguna</font>'
    return '<br/>'.join(
        f"{_txt(h['etiqueta'])} ×{h['total']} ({_pct(h['confianza_max'])})" for h in hallazgos
    )


def _por_seccion(datos, e):
    bloque = [Paragraph('3. Hallazgos por sección', e['h2'])]
    if not datos['secciones']:
        return bloque + [Paragraph('Ninguna foto fue analizada todavía.', e['texto'])]
    filas = [[Paragraph(f'<b>{t}</b>', e['celda']) for t in ('Sección', 'Fotos', 'Anomalías (confianza máx.)', 'Severidad')]]
    filas += [[Paragraph(f"<b>{_txt(s['codigo'])}</b><br/>{_txt(s['nombre'])}", e['celda']),
               Paragraph(str(s['fotos']), e['celda']),
               Paragraph(_lista_hallazgos(s['hallazgos']), e['celda']),
               Paragraph(_severidad(s['severidad']), e['celda'])]
              for s in datos['secciones']]
    return bloque + [_tabla(filas, [45 * mm, 15 * mm, _ANCHO_UTIL - 92 * mm, 32 * mm])]


def _evidencia(datos, e):
    titulo = Paragraph('4. Evidencia fotográfica', e['h2'])
    if not datos['evidencia']:
        return [titulo, Paragraph('No hay fotos con anomalías.', e['texto'])]
    bloque = []
    origen = ('confirmadas por el inspector' if datos['metodologia']['revision']['revisado']
              else 'detectadas por el modelo')
    intro = Paragraph(f'Fotos analizadas con al menos una anomalía, con las anomalías {origen}.', e['tenue'])
    for item in datos['evidencia']:
        imagen = _imagen(item['clave_imagen']) or Paragraph('Imagen no disponible.', e['tenue'])
        detalle = [
            Paragraph(f"<b>Foto #{item['foto_id']}</b> · {_txt(item['seccion']['codigo'])} · "
                      f"{_txt(item['seccion']['nombre'])}", e['celda']),
            Spacer(1, 3),
            Paragraph(f"Severidad: {_severidad(item['severidad'])}", e['celda']),
            Spacer(1, 3),
            Paragraph(_lista_hallazgos(item['hallazgos']), e['celda']),
        ]
        if item['nota']:
            detalle += [Spacer(1, 4), Paragraph(f"<b>Nota del inspector:</b> {_multilinea(item['nota'])}", e['celda'])]
        if item['con_descartes']:
            # The annotated image was drawn by the model and still shows every detection.
            detalle += [Spacer(1, 4), Paragraph('La imagen muestra todas las detecciones del modelo, incluidas las '
                                                'que el inspector descartó.', e['tenue'])]
        fila = Table([[imagen, detalle]], colWidths=[_ANCHO_IMAGEN + 4 * mm, _ANCHO_UTIL - _ANCHO_IMAGEN - 4 * mm])
        fila.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LINEBELOW', (0, 0), (-1, -1), 0.4, _LINEA),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        bloque.append(fila)
    # The heading travels with the first photo, so it never ends a page alone.
    return [KeepTogether([titulo, intro, bloque[0]])] + [KeepTogether(f) for f in bloque[1:]]


def _no_inspeccionadas(datos, e):
    bloque = [Paragraph('5. Secciones no inspeccionadas', e['h2'])]
    secciones = datos['no_inspeccionadas']
    if not secciones:
        return bloque + [Paragraph('Todas las secciones del buque tienen al menos una foto analizada.', e['texto'])]
    # Two sections per row keeps long hulls (20+ zones) to a short, scannable table.
    celdas = [Paragraph(f"<b>{_txt(s['codigo'])}</b> · {_txt(s['nombre'])}", e['celda']) for s in secciones]
    if len(celdas) % 2:
        celdas.append('')
    filas = [celdas[i:i + 2] for i in range(0, len(celdas), 2)]
    return bloque + [
        Paragraph(f'{len(secciones)} sección(es) sin fotos analizadas; no hay información sobre su estado.',
                  e['tenue']),
        Spacer(1, 3),
        _tabla(filas, [_ANCHO_UTIL / 2] * 2, encabezado=False),
    ]


def _metodologia(datos, e):
    m = datos['metodologia']
    modelos = ', '.join(f"{_txt(x['modelo'])} (v{_txt(x['version'].lstrip('vV'))})" if x['version'] else _txt(x['modelo'])
                        for x in m['modelos']) or '—'
    taxonomias = ', '.join(_txt(t) for t in m['taxonomias']) or '—'
    return [
        Paragraph('6. Metodología', e['h2']),
        Paragraph(f'<b>Modelos de visión:</b> {modelos}', e['texto']),
        Paragraph(f'<b>Versión de la taxonomía:</b> {taxonomias}', e['texto']),
        Spacer(1, 4),
        Paragraph(_aviso_revision(m['revision']), e['tenue']),
    ]


def _aviso_revision(revision):
    base = ('Las anomalías fueron detectadas automáticamente por un modelo de visión artificial. '
            'La confianza indica la certeza del modelo, no la gravedad del daño. ')
    if not revision['revisado']:
        return base + ('Los hallazgos no han sido revisados por una persona: un inspector calificado debe '
                       'confirmarlos antes de tomar decisiones de mantenimiento.')
    descartados = revision['descartados']
    detalle = (f'descartó {descartados} hallazgo(s) como falsos positivos, que no se incluyen en este reporte.'
               if descartados else 'no descartó ningún hallazgo.')
    return base + f'El inspector revisó los hallazgos y {detalle}'



def _lineas_en_blanco(cantidad):
    lineas = Table([[''] for _ in range(cantidad)], colWidths=[_ANCHO_UTIL], rowHeights=[8 * mm] * cantidad)
    lineas.setStyle(TableStyle([('LINEBELOW', (0, 0), (-1, -1), 0.4, _LINEA)]))
    return lineas


def _texto_o_lineas(titulo, texto, e):
    """A titled block with the inspector's text, or blank lines to write by hand."""
    cuerpo = Paragraph(_multilinea(texto), e['texto']) if texto else _lineas_en_blanco(3)
    return [Paragraph(f'<b>{titulo}</b>', e['texto']), Spacer(1, 2), cuerpo, Spacer(1, 8)]


def _firma(datos, e):
    borrador = datos['borrador']
    nombre = borrador['inspector_nombre']
    firmante = (f"{_txt(nombre)}" + (f" · {_txt(borrador['inspector_cargo'])}" if borrador['inspector_cargo'] else '')
                if nombre else '')
    # A blank middle column separates the two signature lines.
    firma = Table(
        [[Paragraph(firmante, e['texto']), '', ''],
         [Paragraph('Nombre y firma del inspector', e['tenue']), '', Paragraph('Fecha', e['tenue'])]],
        colWidths=[_ANCHO_UTIL * 0.55, _ANCHO_UTIL * 0.1, _ANCHO_UTIL * 0.35], rowHeights=[16 * mm, None],
    )
    firma.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, 0), 'BOTTOM'),
        ('LINEBELOW', (0, 0), (0, 0), 0.6, _TINTA),
        ('LINEBELOW', (2, 0), (2, 0), 0.6, _TINTA),
    ]))
    # Kept together so the signature never lands alone on a page (KeepTogether still
    # splits the block when long texts make it taller than a page).
    return [KeepTogether([
        Paragraph('7. Observaciones y recomendaciones del inspector', e['h2']),
        *_texto_o_lineas('Observaciones', borrador['observaciones'], e),
        *_texto_o_lineas('Recomendaciones', borrador['recomendaciones'], e),
        Spacer(1, 6), firma,
    ])]


def generar_pdf(inspeccion):
    """The inspection report as PDF bytes."""
    datos = datos_reporte(inspeccion)
    e = _estilos()
    pie = f"Nautic · {datos['inspeccion']['codigo']} · Generado el {_fecha(timezone.now())}"

    def numerar(canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica', 7.5)
        canvas.setFillColor(_TENUE)
        canvas.drawString(18 * mm, 10 * mm, pie)
        canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f'Página {doc.page}')
        canvas.restoreState()

    salida = io.BytesIO()
    doc = SimpleDocTemplate(
        salida, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=18 * mm,
        title=f"Reporte {datos['inspeccion']['codigo']}", author='Nautic',
    )
    historia = (
        _encabezado(datos, e) + _resumen(datos, e) + _ficha(datos, e) + _por_seccion(datos, e)
        + _evidencia(datos, e) + _no_inspeccionadas(datos, e) + _metodologia(datos, e) + _firma(datos, e)
    )
    doc.build(historia, onFirstPage=numerar, onLaterPages=numerar)
    return salida.getvalue()
