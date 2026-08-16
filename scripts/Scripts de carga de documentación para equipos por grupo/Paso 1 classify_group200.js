/**
 * classify_group200.js
 * 
 * Escanea la carpeta `upload/equipos_docs/Grupo 200` (relativa al repo root) y genera
 * `grupo_200_classification.json` con la clasificación de archivos PDF por equipo.
 *
 * Reglas de detección (case-insensitive, espacios/guiones/underscore ignorados):
 * - Manuales: nombres que contienen palabras como "manual", "manuales", "protocol", "procedimiento", "instrucciones", "operator", "operador", "service", "servicio", "installation", "instalacion".
 *   Un mismo PDF puede contener múltiples manuales; aquí solo clasificamos por archivo.
 * - Planos: contienen "plano", "diagrama", "esquema", "drawing", "plan", "diagram".
 * - Datasheets / Fichas técnicas: contienen "datasheet", "ficha tecnica", "ficha_tecnica", "fichatecnica", "hoja tecnica", "spec", "specsheet".
 *
 * Prioridad de clasificación: si un nombre coincide con palabras de manual y plano,
 * se clasificará en ambos (pero por simplicidad aquí lo colocamos en 'manuales' y 'planos' si coincide);
 * si no coincide con ninguno, se coloca en 'otros'. Solo se procesan .pdf.
 *
 * Uso:
 *  node scripts\classify_group200.js
 *
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// Allow passing a custom folder as first argument. If not provided, try common candidates.
const argPath = process.argv[2];
const candidates = [];
if (argPath) {
  // if user passed an absolute or relative path, use it directly
  candidates.push(path.isAbsolute(argPath) ? argPath : path.join(ROOT, argPath));
}
// common variants observed in repos / user's message
candidates.push(
  path.join(ROOT, 'upload', 'equipos_docs', 'Grupo 200'),
  path.join(ROOT, 'uploads', 'equipos_docs', 'Grupo 200'),
  path.join(ROOT, 'media', 'uploads', 'equipo_docs', 'GRUPO 200'),
  path.join(ROOT, 'media', 'uploads', 'equipo_docs', 'Grupo 200'),
  path.join(ROOT, 'media', 'uploads', 'equipo_docs', 'Grupo_200')
);

let TARGET = null;
for (const c of candidates) {
  if (fs.existsSync(c) && fs.statSync(c).isDirectory()) { TARGET = c; break; }
}

const OUT = path.join(ROOT, 'scripts', 'grupo_200_classification.json');

function normalizeName(name) {
  // Lowercase, replace separators, remove diacritics, parentheses and extra spaces
  const lower = name.toLowerCase().replace(/[-_]+/g, ' ');
  // remove diacritics (áéíóúñ etc.)
  const noAccents = lower.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  // remove common punctuation that could break keyword matching
  const cleaned = noAccents.replace(/[()\[\],.;:]/g, ' ');
  return cleaned.replace(/\s+/g, ' ').trim();
}

const MANUAL_KEYWORDS = [
  'manual', 'manuales', 'protocol', 'protocolos', 'procedimiento', 'procedimientos', 'instrucciones', 'instruction', 'instructions', 'operator', 'operador', 'service', 'servicio', 'installation', 'instalacion', 'mantenimiento', 'maintenance'
];
const PLANO_KEYWORDS = [
  'plano', 'planos', 'diagrama', 'diagram', 'esquema', 'esquemas', 'drawing', 'drawing', 'plan'
];
const DATASHEET_KEYWORDS = [
  'datasheet', 'datasheets',
  'ficha tecnica', 'ficha_tecnica', 'fichatecnica', 'ficha', 'fich', 'ficha de datos', 'hoja tecnica', 'hoja_tecnica',
  'spec', 'specsheet', 'specification', 'especificacion'
];

// Mapping from manual subtype (as used in the frontend MANUAL_TYPES) to keywords
const MANUAL_SUBTYPE_KEYWORDS = {
  'manual_servicio': ['servicio', 'service', 'servicio y mantenimiento', 'instrucciones de servicio'],
  'manual_operador': ['operador', 'operator', 'uso', 'operacion', 'operación', 'instrucciones de uso'],
  'manual_instalacion': ['instalacion', 'installation', 'instalaci', 'instalar', 'instalaciOn'],
  'manual_fluido': ['fluido', 'lubricant', 'fluids', 'aceite', 'aceites', 'cinta spray'],
  'manual_herramientas': ['herramienta', 'herramientas', 'catalogo', 'catalogo de', 'catálogo', 'lista', 'listado'],
  'manual_fabricante': ['fabricante', 'manufacturer', 'del fabricante', 'manufacturer'],
  'manual_partes': ['partes', 'repuestos', 'lista de repuestos', 'lista de piezas', 'spare', 'spares'],
  'manual_mantenimiento': ['mantenimiento', 'maintenance', 'mantenimiento y', 'service and maintenance'],
  'manual_usuario': ['usuario', 'user', 'manual de usuario', 'user manual'],
  'datasheet': ['datasheet', 'ficha tecnica', 'ficha', 'hoja tecnica', 'spec'],
};

function matchesAny(norm, keywords) {
  return keywords.some(k => norm.includes(k));
}

function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const result = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      // ignorar carpetas que parecen fotos
      const n = e.name.toLowerCase();
      if (n.includes('foto') || n.includes('fotos') || n.includes('images') || n.includes('imagenes') || n.includes('img')) continue;
      result.push(...walkDir(full));
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (ext !== '.pdf') continue; // solo procesar PDFs
      result.push(full);
    }
  }
  return result;
}

function classifyFile(filePath) {
  const name = path.basename(filePath, '.pdf');
  const norm = normalizeName(name);
  const isManual = matchesAny(norm, MANUAL_KEYWORDS);
  const isPlano = matchesAny(norm, PLANO_KEYWORDS);
  const isDatasheet = matchesAny(norm, DATASHEET_KEYWORDS);
  // special: catalogo/lista -> sugerir manual_herramientas y manual_partes
  const isCatalog = /\b(catalogo|catalogo de|catálogo|lista|listado)\b/.test(norm);
  // collect suggested subtypes from keyword matches
  const suggestedSet = new Set();
  if (isCatalog) {
    suggestedSet.add('manual_herramientas');
    suggestedSet.add('manual_partes');
  }
  // check subtype keywords
  for (const [subtype, kws] of Object.entries(MANUAL_SUBTYPE_KEYWORDS)) {
    for (const k of kws) {
      if (norm.includes(k)) { suggestedSet.add(subtype); break; }
    }
  }
  let suggestedManualSubtypes = Array.from(suggestedSet);
  if (process.env.DEBUG && process.env.DEBUG === '1') {
    console.log(`DEBUG: ${filePath}`);
    console.log(`  normalized: ${norm}`);
    console.log(`  manual:${isManual} plano:${isPlano} datasheet:${isDatasheet}`);
  }
  // derive types array
  let types = [
    ...(isManual ? ['manual'] : []),
    ...(isPlano ? ['plano'] : []),
    ...(isDatasheet ? ['datasheet'] : []),
  ];
  let isOther = false;
  let suggestedManualFallback = false;
  // If nothing matched, fallback to manual and mark as 'other'
  if (types.length === 0 && !isCatalog) {
    types = ['manual'];
    isOther = true;
    suggestedManualFallback = true;
  }

  // Ensure that every file that is or falls back to manual has at least one suggested subtype
  if (types.includes('manual') && suggestedManualSubtypes.length === 0) {
    // prefer datasheet if isDatasheet
    if (isDatasheet) {
      suggestedManualSubtypes = ['datasheet'];
    } else {
      // default to manual_servicio as a safe generic subtype
      suggestedManualSubtypes = ['manual_servicio'];
    }
  }

  return {
    path: path.relative(ROOT, filePath).replace(/\\/g, '/'),
    name: name,
    lowerName: norm,
    isManual,
    isPlano,
    isDatasheet,
    isCatalog,
    isOther,
    suggestedManualFallback,
    suggestedManualSubtypes,
    types,
  };
}

function main() {
  if (!TARGET) {
    console.error('Carpeta objetivo no encontrada. Intenté las siguientes rutas:');
    candidates.forEach(c => console.error(' -', c));
    console.error('\nPuedes indicar la carpeta correcta como primer argumento:');
    console.error('  node scripts\\classify_group200.js "media\\uploads\\equipo_docs\\GRUPO 200"');
    process.exit(1);
  }
  const equipos = fs.readdirSync(TARGET, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
  const out = {};
  for (const eq of equipos) {
    const folder = path.join(TARGET, eq);
    // ignorar carpetas de fotos
    const entry = { files: [] };
    try {
      const pdfs = walkDir(folder);
      for (const p of pdfs) {
        const info = classifyFile(p);
        entry.files.push(info);
      }
    } catch (err) {
      console.error('error al procesar', folder, err.message);
    }
    out[eq] = entry;
  }

  fs.writeFileSync(OUT, JSON.stringify({ generated_at: new Date().toISOString(), root: path.relative(ROOT, TARGET).replace(/\\/g, '/'), data: out }, null, 2), 'utf8');
  console.log('Clasificación generada en', OUT);
}

main();
