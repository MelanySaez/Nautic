"""Class taxonomy of ``core_engine`` (nautic_core v3.1) for the API.

The library defines every class the models detect: its Spanish label, whether
it is a hull *component* (propeller, anode...) or an *anomaly* (corrosion,
paint peel...), and the severity of each anomaly. This module is the only
place in ``vision/`` that reads it; importing the taxonomy loads no ML
framework.

Detections stored on a photo only keep the class name, so the taxonomy is
applied at read time: photos analyzed before this module existed get the same
labels, with no data migration.
"""
from functools import lru_cache
from typing import Any, Dict, List, Optional

TIPO_ANOMALIA = "anomalia"
TIPO_COMPONENTE = "componente"


@lru_cache(maxsize=1)
def _clases_por_nombre() -> Dict[str, Any]:
    from core_engine.vision.domain import CLASSES

    return {c.name: c for c in CLASSES}


def color_clase(class_id: Optional[int]) -> Optional[str]:
    """``#rrggbb`` the library draws ``class_id`` with on the annotated image."""
    if class_id is None:
        return None
    try:
        from core_engine.vision.rendering import class_color
    except ImportError:
        return None
    r, g, b = class_color(class_id)
    return f"#{r:02x}{g:02x}{b:02x}"


def _tipo(clase) -> str:
    return TIPO_ANOMALIA if clase.is_anomaly else TIPO_COMPONENTE


def info_clase(nombre: str) -> Dict[str, Optional[str]]:
    """``etiqueta``, ``tipo`` and ``severidad`` of a class name.

    A name the installed taxonomy does not know keeps a readable label and has
    neither type nor severity.
    """
    clase = _clases_por_nombre().get(nombre)
    if clase is None:
        return {"etiqueta": (nombre or "").replace("_", " "), "tipo": None, "severidad": None}
    return {"etiqueta": clase.label_es, "tipo": _tipo(clase), "severidad": clase.severity}


def enriquecer_detecciones(detecciones: Optional[List[Dict[str, Any]]]):
    """Copy of the grouped detections with the taxonomy of each class added."""
    if detecciones is None:
        return None
    return [{**d, **info_clase(d.get("class_name", ""))} for d in detecciones]


def listar_taxonomia() -> Dict[str, Any]:
    """Every class of the library, in id order, plus the taxonomy version."""
    from core_engine.vision.domain import CLASSES, TAXONOMY_VERSION

    return {
        "version": TAXONOMY_VERSION,
        "clases": [
            {
                "id": c.id,
                "nombre": c.name,
                "etiqueta": c.label_es,
                "tipo": _tipo(c),
                "severidad": c.severity,
                "color": color_clase(c.id),
            }
            for c in sorted(CLASSES, key=lambda c: c.id)
        ],
    }
