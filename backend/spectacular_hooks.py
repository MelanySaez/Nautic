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
    drf-spectacular (ej. "api", "rondas").  Los endpoints con tags
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
    # Catálogos SWBS
    if any(seg in path for seg in ['/api/grupos/', '/api/subgrupos/',
                                    '/api/sistemas/', '/api/subsistemas/']):
        return 'Catálogos SWBS'

    # Buques
    if '/api/buque' in path:
        return 'Buques'

    # Equipos
    if '/api/equipo' in path or '/api/cj-sugerido/' in path:
        return 'Equipos'

    # Parámetros
    if '/api/parametro' in path:
        return 'Parámetros'

    # Rondas y lecturas
    if '/api/ronda' in path or '/api/lectura' in path:
        return 'Rondas'

    # Datos de prueba
    if '/api/generate-test-data' in path or '/api/delete-test-data' in path:
        return 'Testing'

    return 'Otros'
