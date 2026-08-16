import os
import json
from pathlib import Path
from datetime import datetime, timezone

# Cambia el directorio actual al del script
os.chdir(Path(__file__).parent)

# === CONFIGURACIÓN ============================================================
# Ruta del JSON exportado desde tu sistema
INPUT_JSON = "grupo_200_classification.json"

# Carpeta de salida (donde se generará el archivo .txt)
OUTPUT_SQL = f"update_equipos_docs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"

# ID del equipo que se actualizará en PostgreSQL (fallback si Excel no aporta id)
equipo_id = 11

# Carpeta del grupo base y equipo a procesar (fallback si Excel no aporta ruta)
target_group = "[241] - REDUCTORES"
target_equipo = "[24111] - CAJA REDUCTORA NRO. 1"  # 🔁 <-- cámbialo aquí

# ============================================================================


def esc(s: str) -> str:
    """Escapa comillas simples para SQL."""
    return s.replace("'", "''")


# Cargar datos JSON
try:
    with open(INPUT_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
except FileNotFoundError:
    raise RuntimeError(f"No se encontró {INPUT_JSON} en {Path(__file__).parent}")


# -----------------------------------------------------------------------------
# Funciones para leer Excel con rutas (opcional)
# -----------------------------------------------------------------------------
def procesar_desde_excel(excel_path: str):
    """Lee el Excel y devuelve una lista de dicts con keys:
    - carpeta: ruta/carpeta (string)
    - equipo_id: si existe en la hoja, int/None
    """
    try:
        import pandas as pd
    except Exception:
        raise RuntimeError("pandas no está instalado. Instala con: pip install pandas openpyxl")

    df = pd.read_excel(excel_path)
    rows = []
    # Normalizar nombres de columnas en minúsculas sin espacios
    cols = {c.lower().strip(): c for c in df.columns}
    carpeta_col = cols.get('carpeta', None)
    equipo_id_col = cols.get('equipo_id', None) or cols.get('id', None)
    if carpeta_col is None:
        raise RuntimeError("El archivo Excel no contiene la columna 'carpeta'")

    for _, r in df.iterrows():
        carpeta = r[carpeta_col]
        if pd.isna(carpeta) or str(carpeta).strip() == '':
            continue
        equipo_id_val = None
        if equipo_id_col is not None and not pd.isna(r[equipo_id_col]):
            try:
                equipo_id_val = int(r[equipo_id_col])
            except Exception:
                equipo_id_val = None
        rows.append({'carpeta': str(carpeta).strip(), 'equipo_id': equipo_id_val})
    return rows


def infer_targets_from_carpeta(carpeta: str):
    """Intento simple de extraer target_group y target_equipo desde la ruta/carpeta.
    Regresa (target_group, target_equipo). Si no puede, devuelve (None, None).
    Heurística:
    - Si la carpeta contiene partes como '[num] - NOMBRE' las captura.
    - Si la ruta usa separadores '/', toma la penúltima y la última como grupo/equipo.
    """
    import re
    parts = re.findall(r"\[[0-9]+\] - [^/\\]+", carpeta)
    if len(parts) >= 2:
        return parts[0].strip(), parts[1].strip()

    sep_parts = re.split(r"[\\/]+", carpeta)
    sep_parts = [p.strip() for p in sep_parts if p.strip()]
    if len(sep_parts) >= 2:
        return sep_parts[-2], sep_parts[-1]

    return None, None


# -----------------------------------------------------------------------------


def generar_sql_para_equipo(equipo_id_local: int, target_group_local: str, target_equipo_local: str) -> str:
    """Construye y devuelve un bloque SQL (string) para el equipo indicado.
    Retorna cadena vacía si no hay archivos que procesar.
    """
    files = data.get("data", {}).get(target_group_local, {}).get("files", [])
    filtered_files = [f for f in files if target_equipo_local in f.get("path", "")]

    if not filtered_files:
        return ""

    rows_local = []
    for rec in filtered_files:
        name = rec.get("name", "").strip()

        # === Lógica de clasificación de tipos ===
        tmp_types = []

        def add_type(t: str):
            for part in t.split(','):
                p = part.strip()
                if not p:
                    continue
                if p not in tmp_types:
                    tmp_types.append(p)

        # Si es plano, hacerlo exclusivo: no mezclar con manuales ni datasheet
        if rec.get("isPlano"):
            tmp_types = []
            add_type("plano")
        else:
            if rec.get("isCatalog"):
                add_type("manual_partes")
                add_type("manual_herramientas")
            if rec.get("isDatasheet"):
                add_type("datasheet")

        sugg = rec.get("suggestedManualSubtypes", []) or []
        for t in sugg:
            if isinstance(t, str) and (t.startswith("manual_") or t in ("datasheet", "plano")):
                add_type(t)

        if rec.get("isManual") and not any(t.startswith("manual_") for t in tmp_types):
            add_type("manual_usuario")

        if not tmp_types:
            add_type("manual_usuario")

        types_str = ",".join(tmp_types)
        name_pdf = name if name.lower().endswith(".pdf") else f"{name}.pdf"
        rows_local.append((name_pdf, types_str))

    values_sql_local = ",\n".join([f"      ('{esc(n)}','{esc(t)}')" for n, t in rows_local])

    sql_local = f"""SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

-- Si la sesión está abortada por un error anterior, ejecuta primero:
-- ROLLBACK;

DO $do$
DECLARE
  have_pgcrypto boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') INTO have_pgcrypto;

  WITH datos(name, types) AS (
    SELECT * FROM (
      VALUES
{values_sql_local}
    ) AS v(name, types)
  ),
  src AS (
    SELECT
      jsonb_build_object(
        'id', '',
        'url', 'media/uploads/equipo_docs/' || name,
        'name', name,
        'size', NULL,
        'type', types,
        'uploaded_at', to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      ) AS obj
    FROM datos
  ),
  arr AS (
    SELECT jsonb_agg(obj) AS a FROM src
  )
  UPDATE equipos
  SET documentos = COALESCE(documentos, '[]'::jsonb) ||
    (
      SELECT jsonb_agg(
        CASE
          WHEN have_pgcrypto THEN jsonb_set(elem, '{{id}}', to_jsonb(gen_random_uuid()::text))
          ELSE jsonb_set(elem, '{{id}}', to_jsonb(substring(md5(random()::text || clock_timestamp()::text) FROM 1 FOR 32)))
        END
      )
      FROM (SELECT jsonb_array_elements(a) AS elem FROM arr) s
    )
  WHERE id = {equipo_id_local};
END
$do$ LANGUAGE plpgsql;
"""

    return sql_local


def main():
    EXCEL_PATH = Path(__file__).parent / 'directorio de rutas.xlsx'
    if EXCEL_PATH.exists():
        try:
            filas = procesar_desde_excel(str(EXCEL_PATH))
        except Exception as e:
            print('No se pudo procesar el Excel:', e)
            print('Instala dependencias: pip install pandas openpyxl')
            return

        bloques = []
        for info in filas:
            carpeta = info['carpeta']
            equipo_id_x = info.get('equipo_id') or equipo_id
            tg, te = infer_targets_from_carpeta(carpeta)
            if tg is None or te is None:
                tg = target_group
                te = target_equipo
            bloque = generar_sql_para_equipo(equipo_id_x, tg, te)
            if bloque:
                bloques.append(bloque)

        if not bloques:
            print('No se encontró ningún archivo para las carpetas definidas en el Excel.')
            return

        out_path = Path(__file__).parent / OUTPUT_SQL
        Path(out_path).write_text('\n\n-- === siguiente equipo ===\n\n'.join(bloques), encoding='utf-8')
        print(f"Archivo SQL generado: {out_path}")
    else:
        bloque = generar_sql_para_equipo(equipo_id, target_group, target_equipo)
        if not bloque:
            print('No se encontraron archivos para target_group/target_equipo configurados.')
            return
        out_path = Path(__file__).parent / OUTPUT_SQL
        Path(out_path).write_text(bloque, encoding='utf-8')
        print(f"Archivo SQL generado: {out_path}")


if __name__ == '__main__':
    main()

