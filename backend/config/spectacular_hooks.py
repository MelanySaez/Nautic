"""
Hooks de post-procesamiento para drf-spectacular.

Auto-asigna tags a los endpoints que no tienen @extend_schema explícito,
organizando la documentación Swagger por módulo funcional.
"""

# Tags que se definieron explícitamente con @extend_schema en las vistas.
# El hook NO los modifica.
_EXPLICIT_TAGS = frozenset({
    'Inspección IA',
    'Visión Artificial',
})


def auto_tag_endpoints(result, generator, **kwargs):
    """
    Recorre todos los paths del esquema OpenAPI generado y asigna un tag
    descriptivo a las operaciones cuyos tags fueron auto-generados por
    drf-spectacular (ej. "api").  Los endpoints con tags
    explícitos (definidos con @extend_schema) se dejan intactos.
    """
    for path_str, methods in result.get('paths', {}).items():
        for method, operation in methods.items():
            if not isinstance(operation, dict):
                continue

            # No tocar endpoints con tags explícitos
            current_tags = operation.get('tags', [])
            if current_tags and any(t in _EXPLICIT_TAGS for t in current_tags):
                continue

            tag = _tag_for_path(path_str)
            operation['tags'] = [tag]

    return result


def _tag_for_path(path):
    """Determina el tag apropiado según el prefijo de la URL."""
    # Detección directa con YOLO (nautic_core)
    if '/api/ai/' in path:
        return 'Visión Artificial'

    # Inspecciones de casco con visión artificial
    if '/api/vision/' in path:
        return 'Inspección IA'

    return 'Otros'
