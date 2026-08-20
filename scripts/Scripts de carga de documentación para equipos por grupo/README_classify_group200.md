Clasificación de archivos - Grupo 200

Qué hace

- Escanea la carpeta `upload/equipos_docs/Grupo 200` buscando archivos PDF por equipo.
- Ignora subcarpetas que parezcan contener fotos (`foto`, `fotos`, `images`, `imagenes`, `img`).
- Clasifica cada PDF en una o más categorías: `manual` (manuales), `plano` (planos/esquemas) y `datasheet` (fichas técnicas).
- Genera `scripts/grupo_200_classification.json` con la estructura:
  {
    generated_at: ISOString,
    root: "upload/equipos_docs/Grupo 200",
    data: {
      "Equipo XYZ": { files: [ { path, name, lowerName, isManual, isPlano, isDatasheet, types: [...] }, ... ] },
      ...
    }
  }

Reglas de detección (case-insensitive, espacios/guiones/underscore ignorados):
- Manuales: contienen palabras como `manual`, `protocol`, `procedimiento`, `instrucciones`, `operator`, `servicio`, `instalacion`, `mantenimiento`, etc.
- Planos: contienen `plano`, `diagrama`, `esquema`, `drawing`, `plan`, `diagram`.
- Datasheets / Fichas técnicas: contienen `datasheet`, `ficha tecnica`, `hoja tecnica`, `spec`, `specsheet`, `specification`, `especificacion`.

Notas

- Un archivo puede clasificarse en más de una categoría si su nombre contiene varias palabras clave.
- Solo se procesan archivos `.pdf`.
- Si necesitas ajustar las palabras clave, edita `Paso 1 classify_group200.js` (en esta misma carpeta) y modifica las constantes `MANUAL_KEYWORDS`, `PLANO_KEYWORDS`, `DATASHEET_KEYWORDS`.

Reglas adicionales:
- Catálogo/listas: si el nombre contiene `catalogo`, `catálogo`, `lista` o `listado`, el script lo marcará como `isCatalog: true` y sugerirá los subtipos manuales `manual_herramientas` y `manual_partes` en la salida JSON (campo `suggestedManualSubtypes`). Esto permite revisar rápidamente archivos tipo catálogo y asignarlos como manual de herramientas/partes en tu aplicación.

Fallback:
- Si ningún criterio coincide (no es manual, plano, datasheet ni catálogo), el script por defecto clasificará el archivo como `manual` (campo `types: ['manual']`) y añadirá `isOther: true` y `suggestedManualFallback: true` para indicar que fue un fallback y debe revisarse.

Asignación sugerida de subtipos de manual (keywords -> subtype):
- `manual_servicio`: palabras clave como `servicio`, `service`, `instrucciones de servicio`.
- `manual_operador`: `operador`, `operator`, `uso`, `operacion`, `operación`, `instrucciones de uso`.
- `manual_instalacion`: `instalacion`, `installation`, `instalar`.
- `manual_fluido`: `fluido`, `aceite`, `aceites`, `lubricant`, `cinta spray`.
- `manual_herramientas`: `catalogo`, `catálogo`, `lista`, `listado`, `herramientas`.
- `manual_fabricante`: `fabricante`, `manufacturer`, `del fabricante`.
- `manual_partes`: `partes`, `repuestos`, `lista de repuestos`, `spare`, `spares`.
- `manual_mantenimiento`: `mantenimiento`, `maintenance`.
- `manual_usuario`: `usuario`, `user`, `manual de usuario`.

El script intentará mapear el nombre del archivo a uno o más subtipos. Si el archivo está marcado como `manual` y no se detecta un subtipo específico, se sugerirá `manual_servicio` por defecto (a menos que sea datasheet, en cuyo caso sugerirá `datasheet`).

Uso

Los scripts viven en esta carpeta (`scripts/Scripts de carga de documentación para equipos por grupo/`). Desde la raíz del repo:

```bash
cd "scripts/Scripts de carga de documentación para equipos por grupo"

# Paso 1 — clasifica los PDF y genera el JSON
node "Paso 1 classify_group200.js"

# Paso 2 — convierte el JSON a sentencias SQL
python "Paso 2 convertir_json_a_sql.py"
```

El resultado del paso 1 se escribe en `grupo_200_classification.json`, dentro de esta misma carpeta.

Utilidad adicional: `json_to_csv.js` convierte ese JSON a `grupo_200_files.csv` para revisarlo en hoja de cálculo.
