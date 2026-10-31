"""
Secciones del casco de cada buque.

Cada ``Buque`` declara sus propias secciones al crearse: las estándar
(``SECCIONES_ESTANDAR``) o una lista personalizada. Las estándar se organizan
en dos ejes:
  - Longitudinal: FWD (proa) | MID (centro) | AFT (popa)
  - Vertical:     BTM (fondo) | BLG (pantoque) | SS-P (costado babor)
                  | SS-S (costado estribor) | DK (borde cubierta)

Más zonas especiales: quilla, línea de flotación, zona hélice, tomas de mar.
"""

from .models import SeccionCasco

SECCIONES_ESTANDAR = [
    # ── Fondo (BTM) ────────────────────────────────────────────────
    {
        'codigo': 'FWD-BTM',
        'nombre': 'Fondo — Proa',
        'descripcion': 'Planchas del fondo en el tercio de proa.',
        'orden': 10,
    },
    {
        'codigo': 'MID-BTM',
        'nombre': 'Fondo — Centro',
        'descripcion': 'Planchas del fondo en el tercio central (master section).',
        'orden': 11,
    },
    {
        'codigo': 'AFT-BTM',
        'nombre': 'Fondo — Popa',
        'descripcion': 'Planchas del fondo en el tercio de popa.',
        'orden': 12,
    },

    # ── Pantoque (BLG) ─────────────────────────────────────────────
    {
        'codigo': 'FWD-BLG-P',
        'nombre': 'Pantoque Babor — Proa',
        'descripcion': 'Zona curva entre fondo y costado babor, tercio de proa.',
        'orden': 20,
    },
    {
        'codigo': 'FWD-BLG-S',
        'nombre': 'Pantoque Estribor — Proa',
        'descripcion': 'Zona curva entre fondo y costado estribor, tercio de proa.',
        'orden': 21,
    },
    {
        'codigo': 'MID-BLG-P',
        'nombre': 'Pantoque Babor — Centro',
        'descripcion': 'Zona curva entre fondo y costado babor, tercio central.',
        'orden': 22,
    },
    {
        'codigo': 'MID-BLG-S',
        'nombre': 'Pantoque Estribor — Centro',
        'descripcion': 'Zona curva entre fondo y costado estribor, tercio central.',
        'orden': 23,
    },
    {
        'codigo': 'AFT-BLG-P',
        'nombre': 'Pantoque Babor — Popa',
        'descripcion': 'Zona curva entre fondo y costado babor, tercio de popa.',
        'orden': 24,
    },
    {
        'codigo': 'AFT-BLG-S',
        'nombre': 'Pantoque Estribor — Popa',
        'descripcion': 'Zona curva entre fondo y costado estribor, tercio de popa.',
        'orden': 25,
    },

    # ── Costado Babor (SS-P / Port) ────────────────────────────────
    {
        'codigo': 'FWD-SS-P',
        'nombre': 'Costado Babor — Proa',
        'descripcion': 'Planchas del costado babor (Port) en el tercio de proa.',
        'orden': 30,
    },
    {
        'codigo': 'MID-SS-P',
        'nombre': 'Costado Babor — Centro',
        'descripcion': 'Planchas del costado babor (Port) en el tercio central.',
        'orden': 31,
    },
    {
        'codigo': 'AFT-SS-P',
        'nombre': 'Costado Babor — Popa',
        'descripcion': 'Planchas del costado babor (Port) en el tercio de popa.',
        'orden': 32,
    },

    # ── Costado Estribor (SS-S / Starboard) ───────────────────────
    {
        'codigo': 'FWD-SS-S',
        'nombre': 'Costado Estribor — Proa',
        'descripcion': 'Planchas del costado estribor (Starboard) en el tercio de proa.',
        'orden': 40,
    },
    {
        'codigo': 'MID-SS-S',
        'nombre': 'Costado Estribor — Centro',
        'descripcion': 'Planchas del costado estribor (Starboard) en el tercio central.',
        'orden': 41,
    },
    {
        'codigo': 'AFT-SS-S',
        'nombre': 'Costado Estribor — Popa',
        'descripcion': 'Planchas del costado estribor (Starboard) en el tercio de popa.',
        'orden': 42,
    },

    # ── Borde de cubierta / Traca de cinta (DK) ───────────────────
    {
        'codigo': 'FWD-DK',
        'nombre': 'Borde Cubierta — Proa',
        'descripcion': 'Traca de cinta (sheerstrake) en el tercio de proa.',
        'orden': 50,
    },
    {
        'codigo': 'MID-DK',
        'nombre': 'Borde Cubierta — Centro',
        'descripcion': 'Traca de cinta (sheerstrake) en el tercio central.',
        'orden': 51,
    },
    {
        'codigo': 'AFT-DK',
        'nombre': 'Borde Cubierta — Popa',
        'descripcion': 'Traca de cinta (sheerstrake) en el tercio de popa.',
        'orden': 52,
    },

    # ── Zonas especiales ───────────────────────────────────────────
    {
        'codigo': 'KEEL',
        'nombre': 'Quilla',
        'descripcion': 'Plancha de quilla (keel strake), línea central inferior del casco.',
        'orden': 60,
    },
    {
        'codigo': 'WL-P',
        'nombre': 'Línea de Flotación Babor',
        'descripcion': (
            'Franja de alta corrosión entre obra viva y obra muerta, lado babor. '
            'Zona de oxidación acelerada por contacto intermitente con agua.'
        ),
        'orden': 61,
    },
    {
        'codigo': 'WL-S',
        'nombre': 'Línea de Flotación Estribor',
        'descripcion': (
            'Franja de alta corrosión entre obra viva y obra muerta, lado estribor. '
            'Zona de oxidación acelerada por contacto intermitente con agua.'
        ),
        'orden': 62,
    },
    {
        'codigo': 'PROP',
        'nombre': 'Zona Hélice y Timón',
        'descripcion': (
            'Área en popa que incluye hélice, timón y planchas adyacentes. '
            'Sujeta a cavitación y erosión intensa.'
        ),
        'orden': 70,
    },
    {
        'codigo': 'SEA-CHEST',
        'nombre': 'Tomas de Mar',
        'descripcion': (
            'Rejillas y área circundante de las tomas de mar (sea chests). '
            'Propensas a incrustaciones marinas y corrosión.'
        ),
        'orden': 71,
    },
]


_CODIGO_MAX = SeccionCasco._meta.get_field('codigo').max_length
_NOMBRE_MAX = SeccionCasco._meta.get_field('nombre').max_length


def seccion_to_dict(s):
    return {
        'id': s.id,
        'codigo': s.codigo,
        'nombre': s.nombre,
        'descripcion': s.descripcion,
        'orden': s.orden,
    }


def crear_secciones_estandar(buque):
    """Create the standard set for ``buque``. Returns the created sections."""
    return SeccionCasco.objects.bulk_create(
        SeccionCasco(buque=buque, **datos) for datos in SECCIONES_ESTANDAR
    )


def crear_secciones_personalizadas(buque, secciones):
    """
    Create the sections of a validated custom list (see ``validar_secciones``);
    ``orden`` follows the list position.
    """
    return SeccionCasco.objects.bulk_create(
        SeccionCasco(
            buque=buque,
            codigo=s['codigo'],
            nombre=s['nombre'],
            descripcion=s['descripcion'],
            orden=posicion,
        )
        for posicion, s in enumerate(secciones, start=1)
    )


def _texto_opcional(valor, maximo, etiqueta):
    """Returns (texto_limpio, error). ``None``/missing counts as empty text."""
    if valor is None:
        return '', None
    if not isinstance(valor, str):
        return None, f'{etiqueta}: debe ser texto.'
    valor = valor.strip()
    if maximo is not None and len(valor) > maximo:
        return None, f'{etiqueta}: máximo {maximo} caracteres.'
    return valor, None


def validar_secciones(valor):
    """
    Validate the custom sections of a vessel creation payload.

    ``valor`` is a list of ``{nombre, codigo?, descripcion?}``. Returns
    ``(secciones_limpias, errores)``: ``errores`` is a list of messages (empty
    when valid) and each clean section has ``nombre``, ``codigo`` (generated as
    ``SEC-01``... when blank, unique within the list) and ``descripcion``.
    """
    if not isinstance(valor, list):
        return None, ['Debe ser "estandar" o una lista de secciones.']
    if not valor:
        return None, ['Debe declarar al menos una sección.']

    errores = []
    limpias = []
    for posicion, item in enumerate(valor, start=1):
        etiqueta = f'Sección {posicion}'
        if not isinstance(item, dict):
            errores.append(f'{etiqueta}: debe ser un objeto.')
            continue
        desconocidos = set(item) - {'nombre', 'codigo', 'descripcion'}
        if desconocidos:
            errores.append(f'{etiqueta}: campos desconocidos ({", ".join(sorted(desconocidos))}).')

        nombre, error = _texto_opcional(item.get('nombre'), _NOMBRE_MAX, f'{etiqueta} nombre')
        if error:
            errores.append(error)
        elif not nombre:
            errores.append(f'{etiqueta}: el nombre es requerido.')
        codigo, error = _texto_opcional(item.get('codigo'), _CODIGO_MAX, f'{etiqueta} codigo')
        if error:
            errores.append(error)
        descripcion, error = _texto_opcional(item.get('descripcion'), None, f'{etiqueta} descripcion')
        if error:
            errores.append(error)
        limpias.append({'nombre': nombre, 'codigo': codigo, 'descripcion': descripcion})

    if errores:
        return None, errores

    # Explicit codes must be unique (case-insensitive); only then fill the blanks.
    vistos = set()
    for s in limpias:
        if not s['codigo']:
            continue
        clave = s['codigo'].casefold()
        if clave in vistos:
            errores.append(f'Código duplicado: {s["codigo"]}.')
        vistos.add(clave)
    if errores:
        return None, errores

    for posicion, s in enumerate(limpias, start=1):
        if s['codigo']:
            continue
        numero = posicion
        while f'SEC-{numero:02d}'.casefold() in vistos:
            numero += 1
        s['codigo'] = f'SEC-{numero:02d}'
        vistos.add(s['codigo'].casefold())
    return limpias, []
