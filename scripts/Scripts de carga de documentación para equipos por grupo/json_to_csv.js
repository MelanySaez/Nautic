const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IN = path.join(__dirname, 'grupo_200_classification.json');
const OUT = path.join(__dirname, 'grupo_200_files.csv');

if (!fs.existsSync(IN)) {
  console.error('Input JSON not found:', IN);
  process.exit(1);
}

const j = JSON.parse(fs.readFileSync(IN, 'utf8'));
const rows = [];
for (const [folder, entry] of Object.entries(j.data || {})) {
  const files = entry.files || [];
  for (const f of files) {
    rows.push({
      path: f.path,
      name: f.name,
      norm: f.lowerName || '',
      types: (f.types || []).join(','),
      isCatalog: f.isCatalog || false,
      suggestedManualSubtypes: (f.suggestedManualSubtypes || []).join(','),
      isOther: f.isOther || false,
      suggestedManualFallback: f.suggestedManualFallback || false,
      folder: folder,
    });
  }
}

function escapeCsv(s) {
  if (s === null || s === undefined) return '';
  const str = String(s);
  if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

const hdr = ['path','name','norm','types','isCatalog','suggestedManualSubtypes','isOther','suggestedManualFallback','folder'];
const lines = [hdr.join(',')];
for (const r of rows) {
  const vals = hdr.map(h => escapeCsv(r[h]));
  lines.push(vals.join(','));
}

fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log('Wrote CSV to', OUT);
