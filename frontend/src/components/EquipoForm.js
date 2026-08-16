// src/components/EquipoForm.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import PreviewModal from './PreviewModal';
import Toaster from './ui/Toaster';
import useToasts from './ui/useToasts';
import './ui/toast.css';
import './EquipoForm.css';
import api from '../services/api';
import { API_BASE } from '../config';


/* === Helpers reintroducidos (fueron eliminados en refactor) === */
// Extensión (incluyendo el punto) en minúscula
const getExt = (name = '') => {
  try {
    const n = String(name).trim();
    const i = n.lastIndexOf('.');
    return i >= 0 ? n.slice(i).toLowerCase() : '';
  } catch { return ''; }
};

const getExtFromNameOrUrl = (name, url) => {
  const a = getExt(name);
  if (a) return a;
  try {
    const u = String(url || '');
    const clean = u.split('?')[0].split('#')[0];
    return getExt(clean);
  } catch { return ''; }
};

// Tipos de documentos generales (no manuales específicos ni manto)
const DOCUMENT_TYPES = [
  { value: 'plan_mantenimiento', label: 'Plan de mantenimiento', exts: ['.pdf'] },
  { value: 'manual_tecnico', label: 'Manual técnico', exts: ['.pdf'] },
  { value: 'plano', label: 'Plano', exts: ['.pdf'] },
  { value: 'esquema', label: 'Esquema', exts: ['.pdf'] },
  { value: 'certificado', label: 'Certificado', exts: ['.pdf'] },
  { value: 'procedimiento', label: 'Procedimiento', exts: ['.pdf'] },
  { value: 'especificacion', label: 'Especificación', exts: ['.pdf'] },
  { value: 'ficha_tecnica', label: 'Ficha técnica', exts: ['.pdf'] },
  { value: 'lista_repuestos', label: 'Lista de repuestos', exts: ['.pdf'] },
  { value: 'informe_diagnostico', label: 'Informe diagnóstico', exts: ['.pdf'] },
  { value: 'historial_manto', label: 'Historial mantenimiento', exts: ['.pdf'] },
  { value: 'checklist', label: 'Checklist', exts: ['.pdf'] },
];


const typeByValue = Object.fromEntries(DOCUMENT_TYPES.map(t => [t.value, t]));
const acceptStringFor = (value) => (typeByValue[value]?.exts || ['.pdf']).join(',');

const badgeForType = (value) => {
  switch (value) {
    case 'plan_mantenimiento': return { label: 'Plan', className: 'text-bg-primary' };
    case 'manual_tecnico':     return { label: 'Manual', className: 'text-bg-info' };
    case 'plano':              return { label: 'Plano', className: 'text-bg-warning' };
    case 'esquema':            return { label: 'Esquema', className: 'text-bg-success' };
    case 'certificado':        return { label: 'Certificado', className: 'text-bg-secondary' };
    case 'procedimiento':      return { label: 'Proced.', className: 'text-bg-secondary' };
    case 'especificacion':     return { label: 'Especificación', className: 'text-bg-secondary' };
    case 'ficha_tecnica':      return { label: 'Ficha', className: 'text-bg-success' };
    case 'lista_repuestos':    return { label: 'Repuestos', className: 'text-bg-dark' };
    case 'informe_diagnostico':return { label: 'Informe', className: 'text-bg-secondary' };
    case 'historial_manto':    return { label: 'Historial', className: 'text-bg-secondary' };
    case 'checklist':          return { label: 'Checklist', className: 'text-bg-secondary' };
    default:                   return { label: 'Archivo', className: 'text-bg-dark' };
  }
};

// Empaqueta y envía los documentos nuevos (solo los que existen en memoria frontend)
async function subirDocumentosDeEquipo(API_BASE, equipoId, docs, showUploadWebhookAlert) {
  // Usa la instancia axios autenticada (importada arriba como api) para heredar cookies/refresh
  if (!docs?.length) return { ok: true, created: 0 };
  const fd = new FormData();
  docs.forEach(d => {
    if (d?.file) {
      // Permitir renombrar el archivo enviado usando el nombre editado en UI
      const desiredName = (d?.name && String(d.name).trim()) ? String(d.name).trim() : d.file.name;
      fd.append('docs_new', d.file, desiredName);
      fd.append('docs_new_types', d.tipo);
    }
  });

  // La instancia api ya tiene baseURL = API_BASE (+/api). Evitamos duplicar /api si API_BASE ya lo trae.
  // Endpoint relativo conforme a otras llamadas: /equipos/<id>/documentos/
  try {
    const { data: result } = await api.post(`/equipos/${equipoId}/documentos/`, fd, {
      // No fijes Content-Type: axios añadirá correctamente 'multipart/form-data; boundary=...'
      withCredentials: true,
    });

    if (result?.webhook?.success && showUploadWebhookAlert) {
      showUploadWebhookAlert({
        type: 'success',
        message: 'Documentos subidos y notificación enviada correctamente'
      });
    } else if (result?.webhook && !result.webhook.success) {
      // Silencioso: no UI, solo log
      console.warn('Webhook de documentos falló:', result.webhook.error);
    }

    return result;
  } catch (err) {
    // Detalle de error para depurar 401/403/500
    const status = err?.response?.status;
    const detail = err?.response?.data;
    console.error('❌ Error subiendo documentos', status, detail, err);
    if (status === 401) {
      throw new Error('No autorizado (401). Tu sesión puede haber expirado. Intenta recargar e iniciar sesión de nuevo.');
    }
    if (status === 403) {
      throw new Error('Prohibido (403). No tienes permisos para subir documentos.');
    }
    throw new Error(`Error subiendo documentos (${status || 'desconocido'})`);
  }
}


// // Subida en lote de documentos pendientes conforme al endpoint backend
// // Backend espera: docs_new[] (archivos) + docs_new_types[] (mismos índices)
// async function subirDocumentosDeEquipo(apiBaseUrl, equipoId, docs = []) {
//   const validos = (docs || []).filter(d => d?.file);
//   if (validos.length === 0) return;
//   const fd = new FormData();
//   validos.forEach(d => {
//     fd.append('docs_new', d.file);
//     fd.append('docs_new_types', d.tipo || d.type || 'Otro');
//   });
//   try {
//     await api.post(`${apiBaseUrl}/api/equipos/${equipoId}/documentos/`, fd, {
//       headers: { 'Content-Type': 'multipart/form-data' }
//     });
//   } catch (err) {
//     console.error('Fallo subiendo documentos', err);
//     throw err;
//   }
// }


const PLANO_TYPES = new Set(['plano', 'esquema']);

// ¿Se puede previsualizar in-browser?
const canPreview = (ext) => {
  const e = String(ext || '').toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf'].includes(e);
};

// Formato legible de bytes
const bytesToHuman = (b) => {
  const n = Number(b) || 0;
  if (n < 1024) return `${n} B`;
  const units = ['KB','MB','GB','TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
};



export default function EquipoFormWrapper(props){
  // Sin autenticación
  const ROLE = null?.role;
  const IS_ADMIN = ROLE === 'admin';
  const IS_SUPER = ROLE === 'superuser' || ROLE === 'super';
  const CAN_EDIT = IS_ADMIN || IS_SUPER;
  // Expose these via context or pass as props to inner component if needed
  return <EquipoFormInner {...props} ROLE={ROLE} IS_ADMIN={IS_ADMIN} IS_SUPER={IS_SUPER} CAN_EDIT={CAN_EDIT} />;
}

// Original component renamed internally
function EquipoFormInner({
  embedded = false,
  equipoIdProp = null,
  buqueIdProp = '',
  grupoIdProp = '',
  onSaved = () => {},
  onCancel = () => {},
  onFormDataChange = () => {},
  onDocumentSelected = () => {},
  onDeleted = () => {},
  ROLE,
  IS_ADMIN,
  IS_SUPER,
  CAN_EDIT,
}) {

  const { toasts, pushToast, removeToast } = useToasts();
  // Tabs
  const [tab, setTab] = useState('info'); // 'info' | 'param' | 'docs' | 'planos'

  // Hooks de router (solo se usan en modo no embebido)
  const params = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Origen de IDs y preselecciones
  const equipoId = embedded ? equipoIdProp : params?.equipoId;
  const buquePreseleccionado = embedded ? buqueIdProp : searchParams.get('buque_id');
  const grupoPreseleccionado = embedded ? grupoIdProp : searchParams.get('grupo_id');

  const [grupos, setGrupos] = useState([]);
  const [subgrupos, setSubgrupos] = useState([]);
  const [sistemas, setSistemas] = useState([]);
  const [subsistemas, setSubsistemas] = useState([]);

  const [paramOptions, setParamOptions] = useState([]);
  const [paramSelected, setParamSelected] = useState([]);
  const [cargandoParams, setCargandoParams] = useState(false);
  const [paramOverrides, setParamOverrides] = useState({}); // { [paramId]: { min: '', max: '' } }
  const [showNewParamForm, setShowNewParamForm] = useState(false);
  const [newParam, setNewParam] = useState({ nombre: '', unidad: '', valor_minimo: '', valor_maximo: '' });
  const [units, setUnits] = useState([]);
  const cargadoEquipoRef = useRef(false);

  // Curated common units to supplement DB values (comprehensive list requested by null)
  const COMMON_UNITS = [
    'm','kg','s','A','K','mol','cd','rad','sr','Hz','N','Pa','J','W','C','V','F','Ω','S','Wb','T','H','°C','lm','lx','Bq','Gy','Sv','kat','m²','m³','m/s','m/s²','kg/m³','Pa·s','N·m','J/kg','W/m²','W/(m·K)','C/m³','V/m','A/m','T·m²','H/m','lm/W','cd/m²','mol/m³','s⁻¹','1','min','h','d','L','t','eV','Da','dB','Np','au','bar','atm','mmHg','Torr','gal','in','ft','yd','mi','nmi','kn','hp','BTU','cal','kcal','Å','km','cm','mm','µm','nm','pm','g','mg','µg','ng','mL','km/h','kW','MW','kWh','Wh','Ah','kPa','MPa','GPa','mbar','mm/s','rad/s','rad/s²','S/m','Ω·m','µS/cm','A/m²','N/m','N/m²','N·s','J/mol','J/(mol·K)','W·s','°F','°R','atm·L','dm³','bar·L'
  ];

  // ====== PLACAS (existentes / nuevas / bajas) ======
  const [placasExistentes, setPlacasExistentes] = useState([]);        // [{id, name, url, label, size, uploaded_at}]
  const [placasPendientes, setPlacasPendientes] = useState([]);        // [{tmpId, file, previewUrl, label, size, ext}]
  const [placasRemoveIds, setPlacasRemoveIds] = useState(new Set());   // ids de placas existentes a borrar

  // ====== PARAM IMGS (existentes / nuevas / bajas) ======
  const [paramImgsExistentes, setParamImgsExistentes] = useState({});   // { [paramId]: [{id, name, url, nota, size, uploaded_at}] }
  const [paramImgsPendientes, setParamImgsPendientes] = useState({});   // { [paramId]: [{tmpId, file, previewUrl, nota, size, ext}] }
  const [paramImgsRemove, setParamImgsRemove] = useState({});           // { [paramId]: Set(idsExistentes) }

  // === Modal local (inline) sólo sobre EquipoForm ===
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const formRootRef = useRef(null);
  const [modalRect, setModalRect] = useState(null);

  useEffect(() => {
    if (!showDeleteModal) return;
    const update = () => {
      const el = formRootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // usamos posición 'fixed' con coords absolutas del documento
      setModalRect({
        left: r.left + window.scrollX,
        top: r.top + window.scrollY,
        width: r.width,
        height: r.height,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [showDeleteModal]);


  // Normaliza rutas del backend a URL absolutas (soporta \ y paths relativos)
  const normalizeUrl = (raw) => {
    const s = String(raw || '').replace(/\\/g, '/');
    if (!s) return '';
    if (s.startsWith('http://') || s.startsWith('https://')) return s;
    // evita doble slash
    return `${API_BASE}/${s.startsWith('/') ? s.slice(1) : s}`;
  };

  const addPlacasFiles = (files) => {
    const now = new Date();
    const added = Array.from(files || []).map((file, i) => ({
      tmpId: `${Date.now()}_${i}_${Math.random().toString(36).slice(2,8)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      label: '',
      size: file.size,
      ext: getExt(file.name),
      addedAt: now,
    }));
    setPlacasPendientes(prev => [...prev, ...added]);
  };

  const setPlacaPendienteLabel = (tmpId, label) => {
    setPlacasPendientes(prev => prev.map(p => p.tmpId === tmpId ? { ...p, label } : p));
  };

  const removePlacaPendiente = (tmpId) => {
    setPlacasPendientes(prev => {
      prev.forEach(p => { if (p.tmpId === tmpId && p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
      return prev.filter(p => p.tmpId !== tmpId);
    });
  };

  const toggleRemovePlacaExistente = (id) => {
    setPlacasRemoveIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ----- Param imágenes -----
  const addParamImgs = (paramId, files) => {
    const now = new Date();
    const arr = Array.from(files || []).map((file, i) => ({
      tmpId: `${paramId}_${Date.now()}_${i}_${Math.random().toString(36).slice(2,8)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      nota: '',
      size: file.size,
      ext: getExt(file.name),
      addedAt: now,
    }));
    setParamImgsPendientes(prev => ({ ...prev, [paramId]: [...(prev[paramId] || []), ...arr] }));
  };

  const setNotaParamImgPend = (paramId, tmpId, nota) => {
    setParamImgsPendientes(prev => ({
      ...prev,
      [paramId]: (prev[paramId] || []).map(it => it.tmpId === tmpId ? { ...it, nota } : it)
    }));
  };

  const removeParamImgPend = (paramId, tmpId) => {
    setParamImgsPendientes(prev => {
      (prev[paramId] || []).forEach(it => { if (it.tmpId === tmpId && it.previewUrl) URL.revokeObjectURL(it.previewUrl); });
      return { ...prev, [paramId]: (prev[paramId] || []).filter(it => it.tmpId !== tmpId) };
    });
  };

  const toggleRemoveParamImgExistente = (paramId, id) => {
    setParamImgsRemove(prev => {
      const cur = new Set(prev[paramId] || []);
      cur.has(id) ? cur.delete(id) : cur.add(id);
      return { ...prev, [paramId]: cur };
    });
  };


  const handleParamImageChange = (paramId, e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    addParamImgs(paramId, files);
    e.target.value = '';
  };


  const [docsExistentes, setDocsExistentes] = useState([]);
  const [docsToRemove, setDocsToRemove] = useState(new Set());
  const [selectedDocument, setSelectedDocument] = useState(null);

  const [form, setForm] = useState({
    grupo_id: '',
    subgrupo_id: '',
    sistema_id: '',
    subsistema_id: '',
    buque_id: buquePreseleccionado || '',
    nombre_equipo: '',
    parametros: '{}',
    imagen: null,
    descripcion: '',
    marca: '',
    modelo: '',
    serial: '',
    codigo_cj: '',
    numero_equipo_sap: '',
    contador: '',
  });

  const [imagenPreview, setImagenPreview] = useState(null);
  const [imagenMarcadaParaEliminar, setImagenMarcadaParaEliminar] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteButtonRect, setDeleteButtonRect] = useState(null);

   
  const handlePlacaImagesChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    // Si quieres limitar total a 8, considera existentes menos marcadas + pendientes
    const totalActual = placasExistentes.filter(p => !placasRemoveIds.has(p.id)).length + placasPendientes.length;
    if (totalActual + files.length > 8) {
      alert('Solo se permiten hasta 8 fotos de placa (entre guardadas y nuevas).');
      e.target.value = '';
      return;
    }
    addPlacasFiles(files);
    e.target.value = '';
  };


  /* ===== Documentación (frontend) ===== */
  const [docs, setDocs] = useState([]);
  // Tipos de manual seleccionados para subir: ahora múltiples
  const [selectedManualTypes, setSelectedManualTypes] = useState(new Set(['manual_servicio']));
  // Compat: mantener selectedType para otras secciones si alguna referencia queda (no usado en manuales)
  const [selectedType, setSelectedType] = useState('manual_servicio'); // deprecated en manuales
  const [selectedMantoType, setSelectedMantoType] = useState('lsa_doc');
  const [selectedPlanoType, setSelectedPlanoType] = useState('plano'); // para pestaña Planos
  const [preview, setPreview] = useState({ open: false, url: '', name: '', isPdf: false });
  const [webhookStatus, setWebhookStatus] = useState(null);
  const [uploadWebhookStatus, setUploadWebhookStatus] = useState(null);
  const [savingStatus, setSavingStatus] = useState(null); // null | 'saving' | 'done' | 'error'

  /* ===== Catálogos ===== */
  useEffect(() => {
    api.get(`${API_BASE}/api/grupos/`).then(({ data }) => setGrupos(data)).catch(console.error);
  }, []);


  // --- Helper: estado vacío para "nuevo equipo" (con buque/grupo preseleccionados)
  const EMPTY_FORM = (buqueId, grupoId) => ({
    grupo_id: grupoId || '',
    subgrupo_id: '',
    sistema_id: '',
    subsistema_id: '',
    buque_id: buqueId || '',
    nombre_equipo: '',
    parametros: '{}',
    imagen: null,
    descripcion: '',
    marca: '',
    modelo: '',
    serial: '',
    codigo_cj: '',
    numero_equipo_sap: '',
    contador: '',
  });

  // --- RESET total cuando NO hay equipoId (modo "Nuevo equipo")
  //     Limpia todo lo del equipo anterior y deja buque/grupo pre-cargados.
  //     También vuelve a la pestaña INFO y pone la imagen por defecto.
  useEffect(() => {
    if (!equipoId) {
      // Form vacío con buque/grupo del contexto actual
      setForm(EMPTY_FORM(buquePreseleccionado, grupoPreseleccionado));

      // Imagen por defecto
      setImagenPreview(`${API_BASE}/media/equipo_img/default_equipo.png`);
      setImagenMarcadaParaEliminar(false);

      // Cascadas vacías
      setSubgrupos([]);
      setSistemas([]);
      setSubsistemas([]);

      // Parámetros
      setParamSelected([]);
      setParamOptions((prev) => prev); // no recarga, solo conserva catálogo ya cargado

      // Placas
      setPlacasExistentes([]);
      // Limpiar URLs de preview antes de resetear
      placasPendientes.forEach(p => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
      setPlacasPendientes([]);
      setPlacasRemoveIds(new Set());

      // Imágenes por parámetro
      setParamImgsExistentes({});
      // Limpiar URLs de preview de imágenes de parámetros
      Object.values(paramImgsPendientes).forEach(arr => {
        arr.forEach(img => { if (img.previewUrl) URL.revokeObjectURL(img.previewUrl); });
      });
      setParamImgsPendientes({});
      setParamImgsRemove({});

      // Documentos
      setDocsExistentes([]);
      // Limpiar URLs de objeto de documentos pendientes
      docs.forEach(doc => { if (doc.previewUrl) URL.revokeObjectURL(doc.previewUrl); });
      setDocs([]);
      setDocsToRemove(new Set());
      setSelectedDocument(null);
      
      // Reset document types y preview
      setSelectedType('manual_servicio');
      setSelectedMantoType('lsa_doc');
      setSelectedPlanoType('plano');
      setPreview({ open: false, url: '', name: '', isPdf: false });
      setWebhookStatus(null);
      setUploadWebhookStatus(null);

      // CJ state reset
      setCjPrefix('');
      setCjSuffix('');
      setCjError('');
      setCjTouched(false);
      setCjSuggestedSuffix('');
      setCjAllowTwo(false);
      setCjExisting1([]);
      setCjExisting2([]);

      // Pestaña por defecto
      setTab('info');
    }
  }, [equipoId, buquePreseleccionado, grupoPreseleccionado, API_BASE]);

  // --- LIMPIEZA cuando cambia de equipo (incluye cambio entre equipos existentes)
  useEffect(() => {
    // Limpiar estados de documentación al cambiar de equipo
    // Limpiar URLs de preview de placas pendientes
    placasPendientes.forEach(p => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
    setPlacasPendientes([]);
    
    // Limpiar URLs de preview de imágenes de parámetros pendientes
    Object.values(paramImgsPendientes).forEach(arr => {
      arr.forEach(img => { if (img.previewUrl) URL.revokeObjectURL(img.previewUrl); });
    });
    setParamImgsPendientes({});
    
    // Limpiar URLs de objeto de documentos pendientes
    docs.forEach(doc => { if (doc.previewUrl) URL.revokeObjectURL(doc.previewUrl); });
    setDocs([]);
    
    // Reset otros estados de documentación
    setDocsToRemove(new Set());
    setSelectedDocument(null);
    setPreview({ open: false, url: '', name: '', isPdf: false });
    setWebhookStatus(null);
    setUploadWebhookStatus(null);
    
    // Reset placas y param imgs remove states
    setPlacasRemoveIds(new Set());
    setParamImgsRemove({});
  }, [equipoId]); // Solo equipoId como dependencia para que se ejecute cada vez que cambie

  /* ===== Parámetros (catálogo) ===== */
  useEffect(() => {
    let alive = true;
    (async () => {
      setCargandoParams(true);
      try {
        const { data: lista } = await api.get(`${API_BASE}/api/parametros/`);
        if (!alive) return;
        const all = (Array.isArray(lista) ? lista : []).map(p => ({
          id: Number(p.id),
          nombre: p.nombre,
          unidad: p.unidad,
          valor_minimo: p.valor_minimo,
          valor_maximo: p.valor_maximo,
        }));
        setParamOptions(all);
      } catch (err) {
        console.error(err);
      } finally {
        if (alive) setCargandoParams(false);
      }
    })();
    return () => { alive = false; };
  }, []);


  // Fetch units for parameter form and merge with curated COMMON_UNITS
  useEffect(() => {
    let alive = true;
    api.get(`${API_BASE}/api/parametros/unidades/`)
      .then(({ data }) => {
        if (!alive) return;
        const fetched = Array.isArray(data) ? data.filter(Boolean).map(String) : [];
        // Merge, dedupe (case-sensitive preserve), then sort case-insensitive
        const merged = Array.from(new Set([...fetched, ...COMMON_UNITS]));
        merged.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        setUnits(merged);
      })
      .catch(err => {
        console.error('Error fetching unidades from backend, using curated list as fallback', err);
        const fallback = Array.from(new Set(COMMON_UNITS)).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        if (alive) setUnits(fallback);
      });
    return () => { alive = false; };
  }, []);

  /* ===== Reset imagen cuando cambia equipo ===== */
  useEffect(() => {
    // Resetear imagen cuando cambia el equipoId
    if (!equipoId) {
      setImagenPreview(`${API_BASE}/media/equipo_img/default_equipo.png`);
    }
  }, [equipoId]);

  /* ===== Carga de equipo (editar) ===== */
  useEffect(() => {
    if (!equipoId) return;

    let alive = true;
    (async () => {
      try {
        // 1) Equipo
        const { data } = await api.get(`${API_BASE}/api/equipos/${equipoId}/`);
        if (!alive) return;

        setForm({
          grupo_id: data.grupo_id,
          subgrupo_id: data.subgrupo_id,
          sistema_id: data.sistema_id || '',
          subsistema_id: data.subsistema_id || '',
          buque_id: data.buque_id || '',
          nombre_equipo: data.nombre_equipo,
          parametros: data.parametros || '{}',
          imagen: null,
          descripcion: data.descripcion || '',
          marca: data.marca || '',
          modelo: data.modelo || '',
          serial: data.serial || '',
          codigo_cj: data.codigo_cj || data.cj || '',
          numero_equipo_sap: data.numero_equipo_sap || '',
          contador: data.contador || '',
        });

        if (data.imagen) {
          const imagenPath = String(data.imagen).replace(/\\/g, '/');
          setImagenPreview(normalizeUrl(imagenPath));
        } else {
          setImagenPreview(`${API_BASE}/media/equipo_img/default_equipo.png`);
        }

        cargadoEquipoRef.current = true;

        // 2) Cascadas iniciales
        if (data.grupo_id) {
          const { data: subgrps } = await api.post(`${API_BASE}/api/subgrupos/`, { grupo_id: data.grupo_id });
          if (!alive) return;
          setSubgrupos(subgrps);
        }
        if (data.subgrupo_id) {
          const { data: sist } = await api.post(`${API_BASE}/api/sistemas/`, { subgrupo_id: data.subgrupo_id });
          if (!alive) return;
          setSistemas(sist);
        }
        if (data.sistema_id) {
          const { data: subsist } = await api.post(`${API_BASE}/api/subsistemas/`, { sistema_id: data.sistema_id });
          if (!alive) return;
          setSubsistemas(subsist);
        }

        // 3) Placas (normaliza URL)
        const placasNorm = (Array.isArray(data.placas) ? data.placas : []).map(p => ({
          ...p,
          url: normalizeUrl(p.url || p.path || p.file || p.image),
        }));
        setPlacasExistentes(placasNorm);
        setPlacasPendientes([]);
        setPlacasRemoveIds(new Set());

        // 4) Imágenes por parámetro existentes (normaliza URL)
        const existentes = {};
        Object.entries(data.parametros_imagenes || {}).forEach(([pid, arr]) => {
          existentes[Number(pid)] = (arr || []).map(x => ({
            id: x.id,
            name: x.name,
            url: normalizeUrl(x.url || x.path || x.file || x.image),
            nota: x.nota || '',
            size: x.size,
            uploaded_at: x.uploaded_at,
          }));
        });
        setParamImgsExistentes(existentes);
        setParamImgsPendientes({});
        setParamImgsRemove({});

        // 5) Parámetros seleccionados
        try {
          const { data: idsSel } = await api.get(`${API_BASE}/api/equipos/${data.id}/parametros-seleccionados/`);
          if (!alive) return;
          setParamSelected((Array.isArray(idsSel) ? idsSel : []).map(Number));
          // 5b) Overrides por parámetro para el equipo
          try {
            const { data: detalle } = await api.get(`${API_BASE}/api/equipos/${data.id}/parametros-detalle/`);
            if (!alive) return;
            const map = {};
            (Array.isArray(detalle) ? detalle : []).forEach(item => {
              const pid = Number(item.id);
              const oc = item.override_config || {};
              map[pid] = {
                min: oc.min !== null && oc.min !== undefined ? String(oc.min) : '',
                max: oc.max !== null && oc.max !== undefined ? String(oc.max) : '',
              };
            });
            setParamOverrides(map);
          } catch (e) {/* silencioso */}
        } catch (e) {
          console.warn('No se pudieron cargar parámetros seleccionados', e);
        }

        // 6) Documentos existentes (opcional normalización URL)
        try {
          const { data: listaDocs } = await api.get(`${API_BASE}/api/equipos/${data.id}/documentos/`);
          if (!alive) return;
          const normalizados = (Array.isArray(listaDocs) ? listaDocs : []).map(d => {
            const ext = getExtFromNameOrUrl(d.name, d.url);
            return {
              id: d.id,
              name: d.name,
              tipo: d.type || d.tipo || 'otro',
              url: normalizeUrl(d.url),
              size: d.size,
              uploaded_at: d.uploaded_at || d.created_at || null,
              ext,
            };
          });
          setDocsExistentes(normalizados);
          setDocsToRemove(new Set());
        } catch (e) {
          console.error('No se pudieron cargar documentos existentes', e);
          setDocsExistentes([]);
        }
      } catch (err) {
        console.error('Error cargando equipo:', err);
      }
    })();

    return () => { alive = false; };
  }, [equipoId]);


  /* ===== Cascadas ===== */
  // ====== CJ Sugerido ======
  const [cjPrefix, setCjPrefix] = useState('');
  const [cjAllowTwo, setCjAllowTwo] = useState(false);
  const [cjSuggestedSuffix, setCjSuggestedSuffix] = useState('');
  const [cjExisting1, setCjExisting1] = useState([]); // sufijos de 1 char
  const [cjExisting2, setCjExisting2] = useState([]); // sufijos de 2 chars
  const [cjSuffix, setCjSuffix] = useState(''); // input usuario
  const [cjError, setCjError] = useState('');
  const [cjTouched, setCjTouched] = useState(false); // indica si el usuario ha interactuado con el campo

  const recomputeCjError = (suffix) => {
    if (!suffix) return '';
    const s = suffix.toUpperCase();
    if (s.length > 2) return 'Máximo 2 caracteres';
    if (!cjAllowTwo && s.length > 1) return 'Sólo 1 caracter permitido';
    if (!/^[1-9A-Z]{1,2}$/.test(s)) return 'Sólo 1-9 o A-Z';
    if (s.length === 1 && cjExisting1.map(x=>x.toUpperCase()).includes(s)) return 'Sufijo ya usado';
    if (s.length === 2 && cjExisting2.map(x=>x.toUpperCase()).includes(s)) return 'Sufijo ya usado';
    return '';
  };

  // Traer sugerencia al cambiar buque/subsistema (siempre actualizar para mostrar el código sugerido)
  useEffect(() => {
    if (!form.buque_id || !form.subsistema_id) return;
    (async () => {
      try {
        const params = new URLSearchParams({ 
          buque_id: form.buque_id, 
          subsistema_id: form.subsistema_id 
        });
        
        // Si estamos editando un equipo, excluirlo de la validación de duplicados
        if (equipoId) {
          params.append('exclude_equipo_id', equipoId);
        }
        
        const { data } = await api.get(`${API_BASE}/api/cj-sugerido/?${params.toString()}`);
        
        // Debug: Log para ver qué está devolviendo el backend
        console.log('🔍 CJ Sugerido Response:', {
          prefix: data.prefix,
          suffix_suggestion: data.suffix_suggestion,
          allow_two: data.allow_two,
          existing_suffixes_1: data.existing_suffixes_1,
          existing_suffixes_2: data.existing_suffixes_2,
          exclude_equipo_id: equipoId
        });
        
        setCjPrefix(data.prefix || '');
        setCjAllowTwo(!!data.allow_two);
        setCjSuggestedSuffix(data.suffix_suggestion || '');
        setCjExisting1(data.existing_suffixes_1 || []);
        setCjExisting2(data.existing_suffixes_2 || []);
        
        // Solo limpiar el sufijo si estamos creando un equipo nuevo
        // Si estamos editando, mantener el sufijo actual a menos que sea inválido
        if (!equipoId) {
          setCjSuffix('');
          setCjTouched(false); // Reset touched state for new equipment
        } else {
          // Si estamos editando y tenemos un código CJ, extraer el sufijo actual
          if (form.codigo_cj && data.prefix) {
            const currentSuffix = form.codigo_cj.startsWith(data.prefix) 
              ? form.codigo_cj.slice(data.prefix.length) 
              : '';
            setCjSuffix(currentSuffix);
            setCjTouched(false); // Reset touched state when loading existing data
          }
        }
        setCjError('');
      } catch (e) { /* silencio */ }
    })();
  }, [form.buque_id, form.subsistema_id, equipoId, form.codigo_cj]);

  useEffect(() => {
    // Solo mostrar errores si el usuario ha interactuado con el campo
    if (cjTouched) {
      setCjError(recomputeCjError(cjSuffix));
    } else {
      setCjError(''); // Limpiar errores si no ha sido tocado
    }
  }, [cjSuffix, cjAllowTwo, cjExisting1, cjExisting2, cjTouched]);

  // Inicializar sufijo CJ cuando se carga un equipo existente
  useEffect(() => {
    if (equipoId && form.codigo_cj && cjPrefix && !cjSuffix && !cjTouched) {
      if (form.codigo_cj.startsWith(cjPrefix)) {
        const extractedSuffix = form.codigo_cj.slice(cjPrefix.length);
        if (extractedSuffix) {
          setCjSuffix(extractedSuffix);
        }
      }
    }
  }, [equipoId, form.codigo_cj, cjPrefix, cjSuffix, cjTouched]);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!form.grupo_id) { setSubgrupos([]); return; }
      try {
        const { data } = await api.post(`${API_BASE}/api/subgrupos/`, { grupo_id: form.grupo_id });
        if (!alive) return;
        setSubgrupos(data);
      } catch (err) {
        console.error(err);
        setSubgrupos([]);
      }
    })();
    return () => { alive = false; };
  }, [form.grupo_id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!form.subgrupo_id) { setSistemas([]); return; }
      try {
        const { data } = await api.post(`${API_BASE}/api/sistemas/`, { subgrupo_id: form.subgrupo_id });
        if (!alive) return;
        setSistemas(data);
      } catch (err) {
        console.error(err);
        setSistemas([]);
      }
    })();
    return () => { alive = false; };
  }, [form.subgrupo_id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!form.sistema_id) { setSubsistemas([]); return; }
      try {
        const { data } = await api.post(`${API_BASE}/api/subsistemas/`, { sistema_id: form.sistema_id });
        if (!alive) return;
        
        // Si no hay subsistemas, auto-crear uno basado en el sistema
        if (!data || data.length === 0) {
          try {
            await api.post(`${API_BASE}/api/subsistemas/auto-create/`, { sistema_id: form.sistema_id });
            // Recargar lista después de crear
            const { data: nuevaData } = await api.post(`${API_BASE}/api/subsistemas/`, { sistema_id: form.sistema_id });
            if (!alive) return;
            setSubsistemas(nuevaData);
            // Auto-seleccionar el subsistema recién creado
            if (nuevaData && nuevaData.length === 1) {
              setForm(prev => ({ ...prev, subsistema_id: nuevaData[0].id }));
            }
          } catch (autoErr) {
            console.error('Error auto-creando subsistema:', autoErr);
            setSubsistemas([]);
          }
        } else {
          setSubsistemas(data);
        }
      } catch (err) {
        console.error(err);
        setSubsistemas([]);
      }
    })();
    return () => { alive = false; };
  }, [form.sistema_id]);


  /* ===== Auto-params por subsistema (crear) ===== */
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!form.subsistema_id) {
        if (!equipoId) setParamSelected([]);
        return;
      }
      if (!equipoId) {
        try {
          const { data: ids } = await api.get(
            `${API_BASE}/api/subsistemas/${form.subsistema_id}/parametros/`
          );
          if (!alive) return;
          setParamSelected((Array.isArray(ids) ? ids : []).map(Number));
        } catch (err) {
          console.error(err);
        }
      }
    })();
    return () => { alive = false; };
  }, [form.subsistema_id, equipoId]);

  // Notify parent component of form data changes
  useEffect(() => {
    if (onFormDataChange) {
      onFormDataChange({
        equipoName: form.nombre_equipo,
        selectedDocument: selectedDocument
      });
    }
  }, [form.nombre_equipo, selectedDocument, onFormDataChange]);

  // Notify parent component of document selection
  useEffect(() => {
    if (selectedDocument && onDocumentSelected) {
      onDocumentSelected(selectedDocument);
    }
  }, [selectedDocument, onDocumentSelected]);

  /* ===== Handlers ===== */
  const handleChange = e => {
    const { name, value } = e.target;

    // Normalización opcional para el CJ (mayúsculas y caracteres permitidos)
    if (name === 'codigo_cj') {
      const normalized = value.toUpperCase().replace(/[^0-9A-Z\-_.]/g, '');
      setForm(prev => ({ ...prev, [name]: normalized }));
      return;
    }

    setForm(prev => ({ ...prev, [name]: value }));
    if (name === 'grupo_id') setForm(prev => ({ ...prev, subgrupo_id: '', sistema_id: '', subsistema_id: '' }));
    if (name === 'subgrupo_id') setForm(prev => ({ ...prev, sistema_id: '', subsistema_id: '' }));
    if (name === 'sistema_id') setForm(prev => ({ ...prev, subsistema_id: '' }));
  };
  const handleCjSuffixChange = (e) => {
    const raw = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g,'');
    let val = raw;
    if (!cjAllowTwo) val = val.slice(0,1); else val = val.slice(0,2);
    setCjSuffix(val);
    setCjTouched(true); // Marcar como tocado cuando el usuario empiece a escribir
  };

  const handleImageChange = e => {
    const file = e.target.files[0];
    setForm(prev => ({ ...prev, imagen: file }));
    if (file) {
      setImagenPreview(URL.createObjectURL(file));
    } else {
      setImagenPreview(null);
    }
  };

  const handleDeleteImage = async () => {
    setForm(prev => ({ ...prev, imagen: null }));
    setImagenPreview(`${API_BASE}/media/equipo_img/default_equipo.png`);
    setImagenMarcadaParaEliminar(true);
    pushToast('Imagen marcada para eliminar', 'success');
  };

  const toggleParam = id => {
    setParamSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Helpers overrides
  const setOverride = (pid, field, value) => {
    setParamOverrides(prev => ({
      ...prev,
      [pid]: { ...(prev[pid] || { min: '', max: '' }), [field]: value }
    }));
  };
  const getDefaultMin = (pid) => {
    const p = paramOptions.find(x => x.id === pid);
    return p?.valor_minimo ?? '';
  };
  const getDefaultMax = (pid) => {
    const p = paramOptions.find(x => x.id === pid);
    return p?.valor_maximo ?? '';
  };

  // Limpiar overrides de no seleccionados
  useEffect(() => {
    setParamOverrides(prev => {
      const next = {};
      paramSelected.forEach(pid => { if (prev[pid]) next[pid] = prev[pid]; });
      return next;
    });
  }, [paramSelected]);

  // ¿este tipo ya está ocupado por un documento guardado NO marcado para eliminar?
  const hasExistingManualOfType = (tipo, docsExistentes, docsToRemove) => {
    return docsExistentes.some(d => d.tipo === tipo && !docsToRemove.has(d.id));
  };

  // ¿este tipo ya está en la lista de pendientes?
  const hasPendingManualOfType = (tipo, docsPendientes) => {
    return docsPendientes.some(d => d.tipo === tipo);
  };


  /* ===== Documentación (solo frontend) ===== */
  const addDocs = (files, tipoValueOrSet) => {
    // Para manuales, solo PDF
    const allowed = ['.pdf'];
    const now = new Date();
    const selectedArray = tipoValueOrSet instanceof Set ? Array.from(tipoValueOrSet) : [tipoValueOrSet];
    const tiposDestino = selectedArray.length ? selectedArray : ['manual_servicio'];

    const added = Array.from(files).map((file, idx) => {
      const ext = getExt(file.name).toLowerCase();
      const valid = allowed.includes(ext);
      const previewUrl = canPreview(ext) ? URL.createObjectURL(file) : '';
      const tipoAsignado = tiposDestino[idx % tiposDestino.length];
      return {
        id: `${Date.now()}_${idx}_${Math.random().toString(36).slice(2,8)}`,
        file,
        name: file.name,
        size: file.size,
        ext,
        addedAt: now,
        tipo: tipoAsignado,
        previewUrl,
        validExt: valid
      };
    });

    setDocs(prev => [...added, ...prev]);
  };


  // onUploadDocs: removido por no uso

  const onUploadPlanos = (e) => {
    if (!e.target.files?.length) return;
    addDocs(e.target.files, selectedPlanoType); // 'plano' o 'esquema'
    e.target.value = '';
  };

  const removeDoc = (id) => {
    setDocs(prev => {
      prev.forEach(d => { if (d.id === id && d.previewUrl) URL.revokeObjectURL(d.previewUrl); });
      return prev.filter(d => d.id !== id);
    });
  };

  const openPreview = (doc) => {
    if (!canPreview(doc.ext) || !doc.previewUrl) return;
    setPreview({ open: true, url: doc.previewUrl, name: doc.name, isPdf: doc.ext === '.pdf' });
  };

  const closePreview = () => {
    if (preview.url?.startsWith('blob:')) URL.revokeObjectURL(preview.url);
    setPreview({ open: false, url: '', name: '', isPdf: false });
  };

  const changeDocType = (id, newType) => {
    setDocs(prev => prev.map(d => {
      if (d.id !== id) return d;
      const allowed = (typeByValue[newType]?.exts || []).map(e => e.toLowerCase());
      const valid = allowed.length === 0 || allowed.includes(d.ext.toLowerCase());
      return { ...d, tipo: newType, validExt: valid };
    }));
  };

  const showWebhookAlert = (status) => {
    setWebhookStatus(status);
    setTimeout(() => setWebhookStatus(null), 5000);
  };

  const showUploadWebhookAlert = (status) => {
    // Solo mostramos si es success; si es warning (falló webhook) lo registramos en consola y lo omitimos para no molestar al usuario.
    if (status?.type === 'success') {
      setUploadWebhookStatus(status);
      setTimeout(() => setUploadWebhookStatus(null), 4000);
    } else if (status) {
      console.warn('[Webhook Upload]', status.message);
    }
  };

  /* ===== Submit ===== */
  const handleSubmit = async (e) => {
    e.preventDefault();
    let _savingToastId = null;
    try {
      // indicador inmediato para el usuario
      setSavingStatus('saving');
      // ttl = Infinity (no autoclose) -> provide a persistent toast
      _savingToastId = pushToast('Guardando cambios...', 'info', Infinity);
      // Antes de construir FormData: componer código CJ final
      let codigoCjFinal = (form.codigo_cj || '').toString().trim();
      
      if (cjPrefix && cjSuffix) {
        // Si tenemos prefijo y sufijo, componemos el código
        codigoCjFinal = cjPrefix + cjSuffix.toUpperCase();
      } else if (form.codigo_cj) {
        // Si no hay sufijo manual pero existe código en el form, usarlo
        codigoCjFinal = form.codigo_cj;
      } else if (cjPrefix && cjSuggestedSuffix) {
        // Si no hay sufijo manual, usar el sugerido
        codigoCjFinal = cjPrefix + cjSuggestedSuffix.toUpperCase();
      }
      
      // Validar que el sufijo no tenga errores
      const finalSuffix = codigoCjFinal ? codigoCjFinal.slice(cjPrefix.length) : '';
      const finalError = recomputeCjError(finalSuffix);
      if (finalError) {
        alert(`Código CJ inválido: ${finalError}`);
        return;
      }
      // 1) Guardar/actualizar equipo
      const formData = new FormData();

      for (let key in form) {
        const v = form[key];
        if (v !== null && v !== undefined && v !== '') formData.append(key, v);
      }
      if (codigoCjFinal) formData.set('codigo_cj', codigoCjFinal);

      // ---- PLACAS: altas (placas_new + placas_new_labels) ----
      if (placasPendientes.length) {
        placasPendientes.forEach((p) => {
          formData.append('placas_new', p.file);
          formData.append('placas_new_labels', p.label || '');
        });
      }
      // ---- PLACAS: bajas (placas_remove_ids) ----
      if (placasRemoveIds.size > 0) {
        formData.append('placas_remove_ids', JSON.stringify(Array.from(placasRemoveIds)));
      }

      // ---- PARAM IMG: altas (paramimgs_new__<pid> + paramimgs_new_notas__<pid>) ----
      Object.entries(paramImgsPendientes).forEach(([pid, arr]) => {
        arr.forEach((it) => formData.append(`paramimgs_new__${pid}`, it.file));
        arr.forEach((it) => formData.append(`paramimgs_new_notas__${pid}`, it.nota || ''));
      });

      // ---- PARAM IMG: bajas (paramimgs_remove_ids__<pid>) ----
      Object.entries(paramImgsRemove).forEach(([pid, setIds]) => {
        if ((setIds || new Set()).size) {
          formData.append(`paramimgs_remove_ids__${pid}`, JSON.stringify(Array.from(setIds)));
        }
      });

      const isEdit = Boolean(equipoId);
      const url = isEdit
        ? `${API_BASE}/api/equipos/${equipoId}/`
        : `${API_BASE}/api/equipos/crear/`;

      const resEquipo = isEdit
        ? await api.put(url, formData) // axios agregará boundary automáticamente
        : await api.post(url, formData);

      if (!resEquipo || !resEquipo.data) throw new Error('Error guardando el equipo');

      const dataEquipo = resEquipo.data;
      const idFinal = isEdit ? Number(equipoId) : Number(dataEquipo.id);

      // Actualizar el estado del formulario con los datos guardados, incluyendo el código CJ final
      if (codigoCjFinal && codigoCjFinal !== form.codigo_cj) {
        setForm(prev => ({ ...prev, codigo_cj: codigoCjFinal }));
        // Limpiar el sufijo manual ya que ahora está en form.codigo_cj
        setCjSuffix('');
        setCjTouched(false);
      }

      // 2) Guardar parámetros
      // Construir overrides a enviar (solo números válidos)
      const config_por_parametro = {};
      paramSelected.forEach(pid => {
        const ov = paramOverrides[pid] || {};
        const minStr = (ov.min ?? '').toString().trim();
        const maxStr = (ov.max ?? '').toString().trim();
        const hasMin = minStr !== '' && !isNaN(Number(minStr));
        const hasMax = maxStr !== '' && !isNaN(Number(maxStr));
        if (hasMin || hasMax) {
          const cfg = {};
          if (hasMin) cfg.min = Number(minStr);
          if (hasMax) cfg.max = Number(maxStr);
          config_por_parametro[pid] = cfg;
        }
      });

      const resParams = await api.post(
        `${API_BASE}/api/equipos/${idFinal}/parametros/`,
        { parametros: paramSelected, config_por_parametro },
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (!resParams || resParams.status < 200 || resParams.status >= 300) {
        throw new Error('Error guardando parámetros del equipo');
      }

      // 3) Actualizar metadatos (renombres) de documentos existentes antes de borrar/subir
      if (docsExistentes && docsExistentes.length) {
        const payloadDocs = docsExistentes.map(d => ({
          id: d.id,
          name: d.name,
          type: d.tipo || d.type,
          url: d.url,
          size: d.size,
          uploaded_at: d.uploaded_at,
        }));
        try {
          await api.put(`${API_BASE}/api/equipos/${idFinal}/documentos/`, { documentos: payloadDocs }, { headers: { 'Content-Type': 'application/json' } });
        } catch (e) {
          console.warn('No se pudo actualizar nombres de documentos existentes (se continuará):', e);
        }
      }

      // 4) Eliminar documentos marcados
      if (docsToRemove.size > 0) {

        const respDel = await api.delete(
          `${API_BASE}/api/equipos/${idFinal}/documentos/`,
          {
            headers: { 'Content-Type': 'application/json' },
            data: { docs_remove_ids: Array.from(docsToRemove) }, // <- axios requiere 'data' en DELETE
          }
        );
        if (!respDel || respDel.status < 200 || respDel.status >= 300) {
          throw new Error(`Error eliminando documentos: ${respDel?.status || ''}`);
        }
        
        const delResult = respDel.data; // axios ya parsea el JSON automáticamente
        
        // Show webhook status alert
        if (delResult.webhook) {
          if (delResult.webhook.success) {
            showWebhookAlert({
              type: 'success',
              message: `Documentos eliminados y notificación enviada correctamente`
            });
          } else {
            showWebhookAlert({
              type: 'warning',
              message: `Documentos eliminados pero falló la notificación: ${delResult.webhook.error}`
            });
          }
        }
      }

      // 5) Subir documentos (nuevos del frontend) y refrescar lista para que pasen de "pendientes" a "guardados"
      if (docs.length) {
        try {
          await subirDocumentosDeEquipo(API_BASE, idFinal, docs, showUploadWebhookAlert);

          // Refrescar documentos desde el backend para obtener IDs/URLs finales
          try {
            const { data: listaDocs } = await api.get(`${API_BASE}/api/equipos/${idFinal}/documentos/`);
            const normalizados = (Array.isArray(listaDocs) ? listaDocs : []).map(d => {
              const ext = getExtFromNameOrUrl(d.name, d.url);
              return {
                id: d.id,
                name: d.name,
                tipo: d.type || d.tipo || 'otro',
                url: normalizeUrl(d.url),
                size: d.size,
                uploaded_at: d.uploaded_at || d.created_at || null,
                ext,
              };
            });
            setDocsExistentes(normalizados);
          } catch (e) {
            console.warn('No se pudo refrescar la lista de documentos tras la subida', e);
          }

          // Limpiar blobs de preview y vaciar "pendientes" para evitar duplicados en siguientes guardados
          docs.forEach(doc => { if (doc.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(doc.previewUrl); });
          setDocs([]);
          setDocsToRemove(new Set());

          // Toaster de confirmación de subida
          pushToast('Documentos subidos correctamente', 'success');
        } catch (e) {
          // Propagar error para manejo general y mantener pendientes para reintento
          throw e;
        }
      }

      // 6) Eliminar imagen si fue marcada
      if (imagenMarcadaParaEliminar && equipoId) {
        try {
          const resp = await api.delete(`${API_BASE}/api/equipos/${equipoId}/imagen/`);
          if (!resp || resp.status < 200 || resp.status >= 300) {
            throw new Error('Error eliminando imagen');
          }
        } catch {
          pushToast('No se pudo eliminar la imagen', 'error');
        }
        setImagenMarcadaParaEliminar(false);
      }

      // Mover placas pendientes a guardadas (feedback inmediato en UI)
      if (placasPendientes.length > 0) {
        const nuevasPlacas = placasPendientes.map((p) => ({
          id: `tmp_${p.tmpId}`,
          name: p.file.name,
          url: p.previewUrl,
          label: p.label,
          size: p.size,
          uploaded_at: new Date().toISOString(),
        }));
        setPlacasExistentes((prev) => [...prev, ...nuevasPlacas]);
        setPlacasPendientes([]);
      }

  // remover toast persistente y notificar éxito
  if (_savingToastId) removeToast(_savingToastId);
  setSavingStatus('done');
  pushToast(isEdit ? 'Equipo actualizado correctamente' : 'Equipo creado correctamente', 'success');

      if (embedded) {
        onSaved({ id: idFinal, data: dataEquipo, isNew: !isEdit });
      } else {
        setTimeout(() => navigate('/gestion-configuracion'), 900);
      }
    } catch (err) {
      console.error('❌ Error al guardar:', err);
      if (_savingToastId) removeToast(_savingToastId);
      setSavingStatus('error');
      pushToast(`Error guardando: ${err?.message || 'revise conexión'}`, 'error');
      alert(err.message || 'Error guardando');
    }
  };

  /* Abre preview a partir de nombre + url (docs del server) */
  const openPreviewUrl = async (name, url) => {
    try {
      const res = await api.get(url, {
        withCredentials: true,
        responseType: 'blob',
      });
      const blob = res.data; // axios retorna el Blob en data cuando responseType='blob'
      const objectUrl = URL.createObjectURL(blob);
      const ext = getExtFromNameOrUrl(name, url);
      setPreview({ open: true, url: objectUrl, name, isPdf: ext === '.pdf' });
    } catch (e) {
      // fallback: abrir en nueva pestaña
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };


  const isMarkedForRemoval = (id) => docsToRemove.has(id);
  const markForRemoval = (id) => setDocsToRemove(prev => new Set(prev).add(id));
  const unmarkForRemoval = (id) => setDocsToRemove(prev => {
    const next = new Set(prev); next.delete(id); return next;
  });

  /* ====== Derivados para pestaña "Planos" ====== */
  const docsExistentesPlanos = docsExistentes.filter(d => PLANO_TYPES.has(d.tipo));
  const docsPendientesPlanos = docs.filter(d => PLANO_TYPES.has(d.tipo));

  const MANUAL_TYPES = [
    { value: 'manual_servicio',     label: 'Manual de servicio' },
    { value: 'manual_operador',     label: 'Manual de operador' },
    { value: 'manual_instalacion',  label: 'Manual de instalación' },
    { value: 'manual_fluido',       label: 'Manual de fluido' },
    { value: 'manual_herramientas', label: 'Manual de herramientas' },
    { value: 'manual_fabricante',   label: 'Manual del fabricante' },
    { value: 'manual_partes',       label: 'Manual de partes' },
    { value: 'manual_mantenimiento',label: 'Manual de mantenimiento' },
    { value: 'manual_usuario',      label: 'Manual de usuario' },
    // Datasheet / ficha técnica: se trata como tipo de manual para el frontend
    { value: 'datasheet',           label: 'Datasheet / Ficha técnica' },
  ];

  const MANTO_TYPES = [
    { value: 'lsa_doc', label: 'Documento LSA' },
    { value: 'sma_doc', label: 'Documento SMA' },
  ];

  const ONLY_MANTO_TYPES = new Set(MANTO_TYPES.map(m => m.value));

  const ONLY_MANUAL_TYPES = new Set(MANUAL_TYPES.map(m => m.value));
  // helpers multi-tipo para manuales (tipo combinado "a,b,c")
  const splitTypes = (t) => String(t || '').split(',').map(s => s.trim()).filter(Boolean);
  const hasAnyManualType = (t) => splitTypes(t).some(x => ONLY_MANUAL_TYPES.has(x));
  // Derivados para manuales: considerar manual si tiene al menos un tipo manual
  const docsExistentesManuales = docsExistentes.filter(d => hasAnyManualType(d.tipo || d.type));
  const docsPendientesManuales = docs.filter(d => hasAnyManualType(d.tipo));

  const typeByValue = Object.fromEntries([
    ...DOCUMENT_TYPES,
    ...MANUAL_TYPES.map(m => ({ ...m, exts: ['.pdf'] })),
    ...MANTO_TYPES.map(m => ({ ...m, exts: ['.pdf'] })),
  ].map(t => [t.value, t]));

  

  // Todos los manuales solo aceptan PDF
  const acceptStringFor = () => '.pdf';

  // ======== Helpers manuales multi-tipo ========
  const toggleManualType = (value) => {
    setSelectedManualTypes(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value); else next.add(value);
      if (next.size === 0) next.add('manual_servicio'); // siempre al menos uno
      return next;
    });
  };

  // Renombrar documento pendiente por id temporal
  const renamePendingDoc = (id, newName) => {
    setDocs(prev => prev.map(d => d.id === id ? { ...d, name: newName } : d));
  };

  // Renombrar documento existente por id (solo en memoria; se persiste con PUT al guardar)
  const renameExistingDoc = (id, newName) => {
    setDocsExistentes(prev => prev.map(d => d.id === id ? { ...d, name: newName } : d));
  };

  // Badges para los nuevos tipos
  const badgeForType = (value) => {
    switch (value) {
      case 'manual_servicio':     return { label: 'M. Servicio', className: 'text-bg-primary' };
      case 'manual_operador':     return { label: 'M. Operador', className: 'text-bg-info' };
      case 'manual_instalacion':  return { label: 'M. Instalación', className: 'text-bg-secondary' };
      case 'manual_fluido':       return { label: 'M. Fluido', className: 'text-bg-success' };
      case 'manual_herramientas': return { label: 'M. Herramientas', className: 'text-bg-warning' };
      case 'manual_fabricante':   return { label: 'M. Fabricante', className: 'text-bg-dark' };
      case 'manual_partes':       return { label: 'M. Partes', className: 'text-bg-danger' };
      case 'manual_usuario':      return { label: 'M. Usuario', className: 'text-bg-info' };
  case 'plan_mantenimiento':  return { label: 'Plan', className: 'text-bg-primary' };
      case 'manual_tecnico':      return { label: 'Manual', className: 'text-bg-info' };
  case 'manual_mantenimiento':return { label: 'M. Mantto', className: 'text-bg-secondary' };
      case 'plano':               return { label: 'Plano', className: 'text-bg-warning' };
      case 'esquema':             return { label: 'Esquema', className: 'text-bg-success' };
      case 'certificado':         return { label: 'Certificado', className: 'text-bg-secondary' };
      case 'procedimiento':       return { label: 'Proced.', className: 'text-bg-secondary' };
      case 'especificacion':      return { label: 'Especificación', className: 'text-bg-secondary' };
      case 'ficha_tecnica':       return { label: 'Ficha', className: 'text-bg-success' };
      case 'lista_repuestos':     return { label: 'Repuestos', className: 'text-bg-dark' };
      case 'informe_diagnostico': return { label: 'Informe', className: 'text-bg-secondary' };
      case 'historial_manto':     return { label: 'Historial', className: 'text-bg-secondary' };
      case 'checklist':           return { label: 'Checklist', className: 'text-bg-secondary' };
      case 'lsa_doc': return { label: 'LSA', className: 'text-bg-primary' };
      case 'sma_doc': return { label: 'SMA', className: 'text-bg-success' };
      default:                    return { label: 'Archivo', className: 'text-bg-dark' };
    }
  };

  

  /* ==================== Render ==================== */
  return (
    <div ref={formRootRef} className="detalle-equipo-container contenedor-principal container p-3 rounded" style={{ position: 'relative' }}>


    {/* === Encabezado + acciones === */}
    <div className="d-flex align-items-center justify-content-between">
      <h5 className="mb-2 text-start fw-bold form-title">
        {equipoId ? 'Editar' : 'Registrar'} Equipo
      </h5>

      <div className="d-flex gap-2">
        {CAN_EDIT && !!equipoId && (
          <button
            type="button"
            className="btn btn-outline-danger btn-sm d-flex align-items-center gap-2"
            onClick={() => {
              setConfirmName('');
              setShowDeleteModal(true);
            }}
            title="Eliminar equipo"
          >
            <i className="bi bi-trash"></i>
            Eliminar equipo
          </button>
        )}

        {embedded && (
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onCancel}>
            Cerrar
          </button>
        )}
      </div>
    </div>

    <hr className="mb-3" />


      {/* NAV TABS */}
      <ul className="nav nav-tabs nav-fill" role="tablist">
        <li className="nav-item" role="presentation">
          <button
            type="button"
            className={`nav-link ${tab === 'info' ? 'active' : ''}`}
            onClick={() => setTab('info')}
            role="tab"
          >
            Información del equipo
          </button>
        </li>
        {CAN_EDIT && (
          <li className="nav-item" role="presentation">
            <button
              type="button"
              className={`nav-link ${tab === 'param' ? 'active' : ''}`}
              onClick={() => setTab('param')}
              role="tab"
            >
              Configuración de parámetros
            </button>
          </li>
        )}
        <li className="nav-item" role="presentation">
          <button
            type="button"
            className={`nav-link ${tab === 'docs' ? 'active' : ''}`}
            onClick={() => setTab('docs')}
            role="tab"
          >
            Manuales
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button
            type="button"
            className={`nav-link ${tab === 'planos' ? 'active' : ''}`}
            onClick={() => setTab('planos')}
            role="tab"
          >
            Planos
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button
            type="button"
            className={`nav-link ${tab === 'manto' ? 'active' : ''}`}
            onClick={() => setTab('manto')}
            role="tab"
          >
            Mantenimiento
          </button>
        </li>
      </ul>

      <form onSubmit={handleSubmit}>
        {/* ========== TAB CONTENT ========== */}
        <div className="tab-content py-3">
          {/* ======== INFO ======== */}
          {tab === 'info' && (
            <div className="row g-4">
              {/* Col izquierda */}
              <div className="col-12 col-lg-7">
                <div className="mb-3">
                  <label className="form-label">Nombre del Equipo</label>
                  <input
                    type="text"
                    className="form-control"
                    name="nombre_equipo"
                    required
                    value={form.nombre_equipo}
                    onChange={handleChange}
                    readOnly={!CAN_EDIT}
                    disabled={!CAN_EDIT}
                  />
                </div>

                {/* 🔹 Nuevos campos SWBS */}
                <div className="row g-3 mb-3">
                  <div className="col-md-6">
                    <label className="form-label">Marca</label>
                    <input
                      type="text"
                      className="form-control"
                      name="marca"
                      value={form.marca}
                      onChange={handleChange}
                      placeholder="Marca del equipo"
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Modelo</label>
                    <input
                      type="text"
                      className="form-control"
                      name="modelo"
                      value={form.modelo}
                      onChange={handleChange}
                      placeholder="Modelo del equipo"
                    />
                  </div>
                </div>

                {/* Row 1: Serial + Grupo */}
                <div className="row g-3 mb-3">
                  <div className="col-md-6">
                    <label className="form-label">Serial</label>
                    <input
                      type="text"
                      className="form-control"
                      name="serial"
                      value={form.serial}
                      onChange={handleChange}
                      placeholder="Número de serie"
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Grupo</label>
                    <select
                      name="grupo_id"
                      className="form-select"
                      required
                      value={form.grupo_id}
                      onChange={handleChange}
                      disabled={!CAN_EDIT}
                    >
                      <option value="">Seleccione un grupo</option>
                      {grupos.map(g => (
                        <option key={g.id} value={g.id}>
                          {g.numero_de_referencia} - {g.descripcion}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Row 2: Subgrupo + Sistema */}
                <div className="row g-3 mb-3">
                  <div className="col-md-6">
                    <label className="form-label">Subgrupo</label>
                    <select
                      name="subgrupo_id"
                      className="form-select"
                      required
                      disabled={!subgrupos.length || !CAN_EDIT}
                      value={form.subgrupo_id}
                      onChange={handleChange}
                    >
                      <option value="">Seleccione un subgrupo</option>
                      {subgrupos.map(sg => (
                        <option key={sg.id} value={sg.id}>
                          {sg.numero_de_referencia} - {sg.descripcion}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Sistema</label>
                    <select
                      name="sistema_id"
                      className="form-select"
                      required
                      disabled={!sistemas.length || !CAN_EDIT}
                      value={form.sistema_id}
                      onChange={handleChange}
                    >
                      <option value="">Seleccione un sistema</option>
                      {sistemas.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.numero_de_referencia} - {s.descripcion}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Row 3: Subsistema + Código CJ */}
                <div className="row g-3 mb-3">
                  <div className="col-md-6">
                    <label className="form-label">Subsistema</label>
                    <select
                      name="subsistema_id"
                      className="form-select"
                      required
                      disabled={!subsistemas.length || !CAN_EDIT}
                      value={form.subsistema_id}
                      onChange={handleChange}
                    >
                      <option value="">Seleccione un subsistema</option>
                      {subsistemas.map(ss => (
                        <option key={ss.id} value={ss.id}>
                          {ss.numero_de_referencia} - {ss.descripcion}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Código CJ</label>
                    <input
                      type="text"
                      className="form-control"
                      name="codigo_cj"
                      value={form.codigo_cj}
                      onChange={handleChange}
                      placeholder={cjPrefix && cjSuggestedSuffix ? `${cjPrefix}${cjSuggestedSuffix}` : ''}
                      // si quieres permitir siempre edición, no lo ates a subsistema/buque
                      disabled={!CAN_EDIT}
                    />
                  </div>
                </div>

                {/* ========== NUEVOS CAMPOS: Número SAP y Contador ========== */}
                <div className="row g-3 mb-3">
                  <div className="col-md-6">
                    <label className="form-label">Número equipo SAP</label>
                    <input
                      type="text"
                      className="form-control"
                      name="numero_equipo_sap"
                      value={form.numero_equipo_sap}
                      onChange={handleChange}
                      placeholder="Número de equipo en sistema SAP"
                      disabled={!CAN_EDIT}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Contador</label>
                    <input
                      type="number"
                      className="form-control"
                      name="contador"
                      value={form.contador}
                      onChange={handleChange}
                      placeholder="Contador del equipo"
                      disabled={!CAN_EDIT}
                    />
                  </div>
                </div>
              </div>

              {/* Col derecha: imagen + descripción debajo */}
              <div className="col-12 col-lg-5">
                <label className="form-label">Imagen del Equipo</label>
                <div
                  className="position-relative d-inline-block w-100"
                  style={{ maxWidth: '100%', border: '1px solid #e6e9ef', borderRadius: '10px' }}
                >
                  {imagenPreview ? (
                    <>
                      <img
                        src={imagenPreview}
                        alt="Preview"
                        className="img-fluid rounded w-100"
                        style={{ maxHeight: 280, objectFit: 'contain', backgroundColor: '#ffffffff' }}
                      />
                      {CAN_EDIT && (
                        <div style={{ position: 'absolute', bottom: '10px', right: '10px', display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ borderRadius: '50%' }}
                            onClick={() => document.getElementById('imagen-equipo-input').click()}
                            title="Cambiar imagen"
                          >
                            <i className="bi bi-pencil-fill"></i>
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            style={{ borderRadius: '50%' }}
                            onClick={handleDeleteImage}
                            title="Eliminar imagen"
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div
                      className="d-flex flex-column align-items-center justify-content-center rounded bg-light text-muted"
                      style={{ height: 280, cursor: 'pointer' }}
                      onClick={() => document.getElementById('imagen-equipo-input').click()}
                    >
                      <i className="bi bi-image mb-2" style={{ fontSize: '2rem' }}></i>
                      <span>Click para seleccionar imagen</span>
                    </div>
                  )}
                  <input
                    type="file"
                    id="imagen-equipo-input"
                    className="d-none"
                    accept="image/*"
                    onChange={handleImageChange}
                  />
                </div>

                {/* ⬇️ NUEVO: Descripción debajo de la imagen */}
                <div className="mt-3">
                  <label className="form-label">Descripción</label>
                  <textarea
                    className="form-control"
                    name="descripcion"
                    rows="4"
                    value={form.descripcion}
                    onChange={handleChange}
                    placeholder="Descripción del equipo"
                  />
                </div>

                  
              </div>

           
              {/* ========== SECCIÓN: Fotos de Números de Placa ========== */}
              <div className="col-12 mt-4">
                <label className="form-label fw-bold">Fotos de Números de Placa</label>
                <div className="text-muted mb-2" style={{fontSize:'0.95em'}}>
                  Puedes cargar hasta 8 imágenes en total (guardadas + nuevas). Cada imagen puede tener un nombre/etiqueta.
                </div>

                {CAN_EDIT && (
                  <input
                    type="file"
                    className="form-control mb-3"
                    accept=".jpg,.jpeg,.png,.webp"
                    multiple
                    onChange={handlePlacaImagesChange}
                  />
                )}

                {/* Guardadas */}
                <div className="mb-2 fw-semibold">Guardadas</div>
                <div className="row g-3 mb-4">
                  {placasExistentes.length === 0 ? (
                    <div className="col-12 text-muted fst-italic">No hay placas guardadas.</div>
                  ) : (
                    placasExistentes.map(p => {
                      const marcada = placasRemoveIds.has(p.id);
                      return (
                        <div key={p.id} className="col-12 col-md-6">
                          <div className="card border">
                            <div className="card-body p-2 d-flex align-items-center gap-2">
                              <img
                                src={p.url}
                                alt={p.name}
                                onClick={() =>
                                  setPreview({
                                    open: true,
                                    url: p.url,
                                    name: p.label || p.name || 'Placa',
                                    isPdf: false
                                  })
                                }
                                title="Ver imagen grande"
                                style={{
                                  width: 80,
                                  height: 80,
                                  objectFit: 'cover',
                                  borderRadius: 8,
                                  border: '1px solid #eee',
                                  filter: marcada ? 'grayscale(100%)' : 'none',
                                  cursor: 'zoom-in'
                                }}
                              />
                              <div className="flex-grow-1">
                                <div className="small fw-semibold">{p.label || p.name}</div>
                                <div className="text-muted small">{bytesToHuman(p.size || 0)}</div>
                              </div>
                              {CAN_EDIT && (
                                <button
                                  type="button"
                                  className={`btn btn-sm ${marcada ? 'btn-success' : 'btn-outline-danger'}`}
                                  title={marcada ? 'Deshacer' : 'Marcar para eliminar'}
                                  onClick={() => toggleRemovePlacaExistente(p.id)}
                                >
                                  <i className={`bi ${marcada ? 'bi-arrow-counterclockwise' : 'bi-trash'}`}></i>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Pendientes */}
                <div className="mb-2 fw-semibold">Pendientes de subir</div>
                <div className="row g-3">
                  {placasPendientes.length === 0 ? (
                    <div className="col-12 text-muted fst-italic">No hay imágenes nuevas.</div>
                  ) : (
                    placasPendientes.map(p => (
                      <div key={p.tmpId} className="col-12 col-md-6">
                        <div className="card border">
                          <div className="card-body p-2 d-flex align-items-center gap-2">
                            <img src={p.previewUrl} alt={p.file?.name} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border:'1px solid #eee' }} />
                            <div className="flex-grow-1">
                              <label className="form-label mb-1 small">Nombre/etiqueta</label>
                              <input
                                type="text"
                                className="form-control form-control-sm"
                                value={p.label}
                                onChange={(e) => setPlacaPendienteLabel(p.tmpId, e.target.value)}
                                placeholder="Ej: Placa principal"
                              />
                              <div className="text-muted small mt-1">{bytesToHuman(p.size)} · {p.ext}</div>
                            </div>
                            {CAN_EDIT && (
                              <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => removePlacaPendiente(p.tmpId)}>
                                <i className="bi bi-trash"></i>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            
          )}


          {/* ======== PARAM ======== */}
          {tab === 'param' && (
            <div className="mt-2">
              <label className="form-label d-flex align-items-center gap-2">
                Parámetros disponibles {cargandoParams && <small className="text-muted">(cargando…)</small>}
              </label>
              <div className="alert alert-light py-2">
                <div className="small text-muted">
                  Deja los campos Min/Max vacíos para usar los valores globales del parámetro. Si ingresas valores aquí, aplican solo a este equipo.
                </div>
              </div>
              {CAN_EDIT && (
                <div className="mb-3">
                  <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setShowNewParamForm(s=>!s)}>
                    <i className="bi bi-plus-lg me-1"></i> {showNewParamForm ? 'Cerrar' : 'Agregar parámetro al catálogo'}
                  </button>
                  {showNewParamForm && (
                    <div className="border rounded p-3 mt-2">
                      <div className="row g-2">
                        <div className="col-md-4">
                          <label className="form-label">Nombre</label>
                          <input className="form-control form-control-sm" value={newParam.nombre} onChange={e=>setNewParam(p=>({...p, nombre: e.target.value}))} />
                        </div>
                        <div className="col-md-2">
                          <label className="form-label">Unidad</label>
                          <select className="form-control form-control-sm" value={newParam.unidad} onChange={e=>setNewParam(p=>({...p, unidad: e.target.value}))} required>
                            <option value="">Seleccione unidad</option>
                            {units.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                        <div className="col-md-3">
                          <label className="form-label">Mínimo (global)</label>
                          <input type="number" step="any" className="form-control form-control-sm" value={newParam.valor_minimo} onChange={e=>setNewParam(p=>({...p, valor_minimo: e.target.value}))} />
                        </div>
                        <div className="col-md-3">
                          <label className="form-label">Máximo (global)</label>
                          <input type="number" step="any" className="form-control form-control-sm" value={newParam.valor_maximo} onChange={e=>setNewParam(p=>({...p, valor_maximo: e.target.value}))} />
                        </div>
                      </div>
                      <div className="mt-2 d-flex gap-2">
                        <button type="button" className="btn btn-primary btn-sm" onClick={async ()=>{
                          try {
                            const payload = {
                              nombre: (newParam.nombre||'').trim(),
                              unidad: (newParam.unidad||'').trim(),
                              valor_minimo: Number(newParam.valor_minimo),
                              valor_maximo: Number(newParam.valor_maximo),
                            };
                            if (!payload.nombre) { alert('Nombre requerido'); return; }
                            if (!payload.unidad) { alert('Unidad requerida'); return; }
                            if (isNaN(payload.valor_minimo) || isNaN(payload.valor_maximo)) { alert('Min/Max deben ser números'); return; }
                            const { data } = await api.post(`${API_BASE}/api/parametros/agregar/`, payload);
                            const nuevo = { id: Number(data.id), ...payload };
                            setParamOptions(prev => [...prev, nuevo]);
                            setParamSelected(prev => prev.includes(nuevo.id) ? prev : [...prev, nuevo.id]);
                            setNewParam({ nombre: '', unidad: '', valor_minimo: '', valor_maximo: '' });
                            setShowNewParamForm(false);
                            pushToast('Parámetro creado y seleccionado', 'success');
                          } catch (err) {
                            console.error(err);
                            alert('No se pudo crear el parámetro');
                          }
                        }}>Guardar parámetro</button>
                        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={()=>setShowNewParamForm(false)}>Cancelar</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div style={{maxHeight: 420, overflowY: 'auto'}} className="param-list p-0">
                {paramOptions.length ? (
                  paramOptions.map(p => (
                    <div key={p.id} className="param-row">
                      {/* Columna: checkbox + nombre */}
                      <div className="param-cell--name">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id={`param-${p.id}`}
                          checked={paramSelected.includes(p.id)}
                          onChange={() => toggleParam(p.id)}
                        />
                        <label
                          className="form-check-label text-truncate-2"
                          htmlFor={`param-${p.id}`}
                          style={{ display:'inline-block' }}
                        >
                          <span style={{wordBreak:'break-word', overflowWrap:'anywhere'}}>
                            {p.nombre}
                            {p.unidad ? ` (${p.unidad})` : ''}
                          </span>
                        </label>
                      </div>

                      {/* Columna: Min */}
                      <div className="param-cell--min">
                        <div className="input-group input-group-sm">
                          <span className="input-group-text">Min</span>
                          <input
                            type="number"
                            step="any"
                            className="form-control"
                            placeholder={String(getDefaultMin(p.id) ?? '')}
                            value={(paramOverrides[p.id]?.min ?? '')}
                            onChange={e=> setOverride(p.id, 'min', e.target.value)}
                            disabled={!paramSelected.includes(p.id)}
                          />
                        </div>
                      </div>

                      {/* Columna: Max */}
                      <div className="param-cell--max">
                        <div className="input-group input-group-sm">
                          <span className="input-group-text">Max</span>
                          <input
                            type="number"
                            step="any"
                            className="form-control"
                            placeholder={String(getDefaultMax(p.id) ?? '')}
                            value={(paramOverrides[p.id]?.max ?? '')}
                            onChange={e=> setOverride(p.id, 'max', e.target.value)}
                            disabled={!paramSelected.includes(p.id)}
                          />
                        </div>
                      </div>

                      {/* Columna: Imágenes (acciones compactas) */}
                      <div className="param-cell--imgs">
                        {CAN_EDIT && (
                          <>
                            {/* Si hay existentes o pendientes, mostrar acciones actualizar/borrar; si no, mostrar subir */}
                            { (paramImgsExistentes[p.id]?.length || paramImgsPendientes[p.id]?.length) ? (
                              (() => {
                                const existentesArr = (paramImgsExistentes[p.id] || []);
                                const removeSet = (paramImgsRemove[p.id] || new Set());
                                const allMarked = existentesArr.length > 0 && existentesArr.every(img => removeSet.has(img.id));
                                return (
                                  <div className="d-flex align-items-center gap-2">
                                    {/* Mini previews existentes: click = marcar/desmarcar */}
                                    <div className="d-flex align-items-center gap-1 flex-wrap" style={{maxWidth: 140}}>
                                      {existentesArr.slice(0,3).map(img => {
                                        const marcada = removeSet.has(img.id);
                                        return (
                                          <img
                                            key={img.id}
                                            src={img.url}
                                            alt={img.name}
                                            title={(marcada ? 'Desmarcar' : 'Marcar') + ' para eliminar'}
                                            onClick={() => toggleRemoveParamImgExistente(p.id, img.id)}
                                            style={{ width: 28, height: 28, objectFit:'cover', borderRadius:4, border:'1px solid #e9ecef', filter: marcada ? 'grayscale(100%)' : 'none', cursor:'pointer' }}
                                          />
                                        );
                                      })}
                                      {existentesArr.length > 3 && (
                                        <span className="badge bg-secondary">+{(existentesArr.length-3)}</span>
                                      )}
                                    </div>
                                    {/* Botón actualizar (reemplazo/agregar) */}
                                    <label className="btn btn-outline-secondary btn-sm mb-0" title="Actualizar/Agregar imágenes">
                                      <i className="bi bi-upload me-1"></i>
                                      Elegir archivo
                                      <input type="file" className="d-none" accept=".jpg,.jpeg,.png,.webp" multiple onChange={e => handleParamImageChange(p.id, e)} />
                                    </label>
                                    {/* Botón marcar/desmarcar todas */}
                                    {existentesArr.length > 0 && (
                                      <button
                                        type="button"
                                        className={`btn btn-sm ${allMarked ? 'btn-success' : 'btn-outline-danger'}`}
                                        title={allMarked ? 'Desmarcar todas' : 'Marcar todas para eliminar'}
                                        onClick={() => {
                                          const ids = existentesArr.map(x => x.id);
                                          setParamImgsRemove(prev => {
                                            const cur = new Set(prev[p.id] || []);
                                            const next = new Set(cur);
                                            const currentlyAll = ids.every(id => cur.has(id));
                                            if (currentlyAll) {
                                              ids.forEach(id => next.delete(id));
                                            } else {
                                              ids.forEach(id => next.add(id));
                                            }
                                            return { ...prev, [p.id]: next };
                                          });
                                        }}
                                      >
                                        <i className={`bi ${allMarked ? 'bi-arrow-counterclockwise' : 'bi-trash'}`}></i>
                                      </button>
                                    )}
                                  </div>
                                );
                              })()
                            ) : (
                              <div>
                                <label className="btn btn-outline-secondary btn-sm mb-0" title="Subir imagen">
                                  <i className="bi bi-upload me-1"></i>
                                  Elegir archivo
                                  <input type="file" className="d-none" accept=".jpg,.jpeg,.png,.webp" multiple onChange={e => handleParamImageChange(p.id, e)} />
                                </label>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-muted fst-italic p-2">No hay parámetros.</div>
                )}
              </div>
            </div>
          )}

          {/* ======== MANUALES (antes "Gestión documental") ======== */}
          {tab === 'docs' && (
            <div className="mt-2">
              <h6 className="fw-bold mb-2 d-flex align-items-center gap-2">Manuales</h6>
              <div className="row g-3">
                <div className="col-12">
                  {CAN_EDIT && (
                    <div className="border rounded-3 p-3">
                      <div className="row gy-3">
                        <div className="col-12">
                          <label className="form-label">Adjuntar archivo (PDF)</label>
                          <input
                            type="file"
                            className="form-control"
                            accept={acceptStringFor()}
                            multiple
                            onChange={(e) => {
                              if (!e.target.files?.length) return;
                              // Asignar inicialmente al tipo por defecto; luego el usuario ajusta por ítem
                              addDocs(e.target.files, 'manual_servicio');
                              e.target.value = '';
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="border rounded-3 p-3 mt-3">
                    {/* Guardados */}
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <span className="fw-semibold">Manuales guardados</span>
                      <span className="text-muted small">{docsExistentesManuales.length ? `${docsExistentesManuales.length} archivo(s)` : 'Ninguno'}</span>
                    </div>

                    <div className="table-responsive mb-3">
                      <table className="table table-sm align-middle mb-0" style={{ width: '100%' }}>
                        <thead>
                          <tr>
                            <th>Nombre</th>
                            <th className="text-center">Tipo</th>
                            <th className="text-center">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {docsExistentesManuales.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="text-muted fst-italic">No hay manuales guardados.</td>
                            </tr>
                          ) : (
                            docsExistentesManuales.map(doc => {
                              const badge = badgeForType(doc.tipo);
                              const fecha = doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : '';
                              const peso = bytesToHuman(doc.size);
                              const previewable = doc.ext?.toLowerCase() === '.pdf';
                              return (
                                <tr key={doc.id}>
                                  <td>
                                    <div className="d-flex flex-column">
                                      {CAN_EDIT ? (
                                        <input
                                          type="text"
                                          className="form-control form-control-sm"
                                          value={doc.name}
                                          onChange={(e) => renameExistingDoc(doc.id, e.target.value)}
                                        />
                                      ) : (
                                        <span className={`text-break ${selectedDocument?.id === doc.id ? 'fw-bold text-primary' : ''}`}>{doc.name}</span>
                                      )}
                                      <small className="text-muted">
                                        {peso}{fecha ? ` · ${fecha}` : ''} · {doc.ext || ''}
                                      </small>
                                    </div>
                                  </td>
                                  <td className="text-center">
                                    <div className="d-flex flex-column align-items-center" style={{minWidth: 220}}>
                                      <div className="mb-1 manual-types-badges">
                                        {splitTypes(doc.tipo).map(tp => {
                                          const b = badgeForType(tp);
                                          return <span key={tp} className={`badge ${b.className}`}>{b.label}</span>;
                                        })}
                                      </div>
                                      {CAN_EDIT && (
                                        <div className="manual-type-grid">
                                          {MANUAL_TYPES.map(t => (
                                            <div key={t.value} className="form-check manual-type-item">
                                              <input
                                                id={`sv-${doc.id}-${t.value}`}
                                                type="checkbox"
                                                className="form-check-input"
                                                checked={splitTypes(doc.tipo).includes(t.value)}
                                                onChange={(e) => {
                                                  const current = new Set(splitTypes(doc.tipo));
                                                  if (e.target.checked) current.add(t.value); else current.delete(t.value);
                                                  const next = Array.from(current);
                                                  if (next.length === 0) next.push('manual_servicio');
                                                  setDocsExistentes(prev => prev.map(d0 => d0.id === doc.id ? { ...d0, tipo: next.join(',') } : d0));
                                                }}
                                              />
                                              <label htmlFor={`sv-${doc.id}-${t.value}`} className="form-check-label small">{t.label}</label>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="text-center p-0">
                                    <button
                                      type="button"
                                      className="btn btn-outline-secondary btn-sm me-1"
                                      title={previewable ? 'Ver' : 'No disponible para vista previa'}
                                      disabled={!previewable}
                                      onClick={() => {
                                        setSelectedDocument(doc);
                                        openPreviewUrl(doc.name, doc.url);
                                      }}
                                    >
                                      <i className="bi bi-eye"></i>
                                    </button>
                                    {CAN_EDIT && (
                                      isMarkedForRemoval(doc.id) ? (
                                        <button
                                          type="button"
                                          className="btn btn-success btn-sm"
                                          title="Deshacer eliminación"
                                          onClick={() => unmarkForRemoval(doc.id)}
                                        >
                                          <i className="bi bi-arrow-counterclockwise"></i>
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          className="btn btn-outline-danger btn-sm"
                                          title="Marcar para eliminar"
                                          onClick={() => markForRemoval(doc.id)}
                                        >
                                          <i className="bi bi-trash"></i>
                                        </button>
                                      )
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pendientes */}
                    <div className="d-flex align-items-center justify-content-between mb-2 mt-3">
                      <span className="fw-semibold">Manuales pendientes</span>
                      <span className="text-muted small">{docsPendientesManuales.length ? `${docsPendientesManuales.length} por subir` : 'Ninguno'}</span>
                    </div>
                    <div className="table-responsive">
                      <table className="table table-sm align-middle mb-0" style={{ width: '100%' }}>
                        <thead>
                          <tr>
                            <th>Nombre</th>
                            <th className="text-center">Tipo</th>
                            <th className="text-center">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {docsPendientesManuales.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="text-muted fst-italic">No hay manuales agregados.</td>
                            </tr>
                          ) : (
                            docsPendientesManuales.map(doc => {
                              const badge = badgeForType(doc.tipo);
                              const fecha = doc.addedAt instanceof Date ? doc.addedAt.toLocaleDateString() : '';
                              const peso = bytesToHuman(doc.size);
                              const previewable = doc.ext?.toLowerCase() === '.pdf' && !!doc.previewUrl;
                              return (
                                <tr key={doc.id}>
                                  <td>
                                    <div className="d-flex flex-column">
                                      <input
                                        type="text"
                                        className="form-control form-control-sm"
                                        value={doc.name}
                                        onChange={(e) => renamePendingDoc(doc.id, e.target.value)}
                                      />
                                      {!doc.validExt && (
                                        <small className="text-danger">Solo PDF</small>
                                      )}
                                      <small className="text-muted">{peso}{fecha ? ` · ${fecha}` : ''} · {doc.ext}</small>
                                    </div>
                                  </td>
                                  <td className="text-center">
                                    <div className="d-flex flex-column align-items-center" style={{minWidth: 220}}>
                                      <div className="mb-1 manual-types-badges">
                                        {splitTypes(doc.tipo).map(tp => {
                                          const b = badgeForType(tp);
                                          return <span key={tp} className={`badge ${b.className}`}>{b.label}</span>;
                                        })}
                                      </div>
                                      {CAN_EDIT && (
                                        <div className="manual-type-grid">
                                          {MANUAL_TYPES.map(t => (
                                            <div key={t.value} className="form-check manual-type-item">
                                              <input
                                                id={`pd-${doc.id}-${t.value}`}
                                                type="checkbox"
                                                className="form-check-input"
                                                checked={splitTypes(doc.tipo).includes(t.value)}
                                                onChange={(e) => {
                                                  const current = new Set(splitTypes(doc.tipo));
                                                  if (e.target.checked) current.add(t.value); else current.delete(t.value);
                                                  const next = Array.from(current);
                                                  if (next.length === 0) next.push('manual_servicio');
                                                  setDocs(prev => prev.map(d0 => d0.id === doc.id ? { ...d0, tipo: next.join(',') } : d0));
                                                }}
                                              />
                                              <label htmlFor={`pd-${doc.id}-${t.value}`} className="form-check-label small">{t.label}</label>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="text-center p-0">
                                    <button
                                      type="button"
                                      className="btn btn-outline-secondary btn-sm me-1"
                                      title={previewable ? 'Ver' : 'No disponible para vista previa'}
                                      disabled={!previewable}
                                      onClick={() => {
                                        setSelectedDocument(doc);
                                        openPreview(doc);
                                      }}
                                    >
                                      <i className="bi bi-eye"></i>
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-outline-danger btn-sm"
                                      title="Eliminar"
                                      onClick={() => removeDoc(doc.id)}
                                    >
                                      <i className="bi bi-trash"></i>
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}


          {/* ======== PLANOS ======== */}
          {tab === 'planos' && (
            <div className="mt-2">
              <h6 className="fw-bold mb-2 d-flex align-items-center gap-2">Planos</h6>
              <div className="row g-3">
                {/* Solo mostrar columna de carga si no es usuario */}
                {CAN_EDIT && (
                  <div className="col-12 col-lg-6">
                    <div className="border rounded-3 p-3">
                      <div className="row g-3">
                        <div className="col-12">
                          <label className="form-label">Tipo</label>
                          <select
                            className="form-select"
                            value={selectedPlanoType}
                            onChange={(e) => setSelectedPlanoType(e.target.value)}
                            disabled
                          >
                            <option value="plano">{typeByValue['plano'].label}</option>
                          </select>
                          <div className="form-text">
                            Extensiones permitidas: .pdf
                          </div>
                        </div>
                        <div className="col-12">
                          <label className="form-label">Adjuntar archivos</label>
                          <input
                            type="file"
                            className="form-control"
                            multiple
                            accept=".pdf"
                            onChange={onUploadPlanos}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {/* Tabla de planos ocupa 100% si es usuario */}
                <div className={CAN_EDIT ? "col-12 col-lg-6" : "col-12"}>
                  <div className="border rounded-3 p-3">
                    {/* Guardados */}
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <span className="fw-semibold">Planos guardados</span>
                      <span className="text-muted small">{docsExistentesPlanos.length ? `${docsExistentesPlanos.length} archivo(s)` : 'Ninguno'}</span>
                    </div>
                    <div className="table-responsive mb-3">
                      <table className="table table-sm align-middle mb-0" style={{ width: '100%' }}>
                        <thead>
                          <tr>
                            <th>Nombre</th>
                            <th className="text-center">Tipo</th>
                            <th className="text-center">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {docsExistentesPlanos.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="text-muted fst-italic">No hay planos guardados.</td>
                            </tr>
                          ) : (
                            docsExistentesPlanos.map(doc => {
                              const badge = badgeForType(doc.tipo);
                              const fecha = doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : '';
                              const peso = bytesToHuman(doc.size);
                              const previewable = canPreview(doc.ext);
                              return (
                                <tr key={doc.id}>
                                  <td>
                                    <div className="d-flex flex-column">
                                      <span className="text-break">{doc.name}</span>
                                      <small className="text-muted">
                                        {peso}{fecha ? ` · ${fecha}` : ''} · {doc.ext || ''}
                                      </small>
                                    </div>
                                  </td>
                                  <td className="text-center">
                                    <span className={`badge ${badge.className}`}>{badge.label}</span>
                                  </td>
                                  <td className="text-center p-0">
                                    <button
                                      type="button"
                                      className="btn btn-outline-secondary btn-sm me-1"
                                      title={previewable ? 'Ver' : 'No disponible para vista previa'}
                                      disabled={!previewable}
                                      onClick={() => {
                                        setSelectedDocument(doc);
                                        openPreviewUrl(doc.name, doc.url);
                                      }}
                                    >
                                      <i className="bi bi-eye"></i>
                                    </button>
                                    {/* Eliminar solo si no es usuario */}
                                    {CAN_EDIT && (
                                      isMarkedForRemoval(doc.id) ? (
                                        <button
                                          type="button"
                                          className="btn btn-success btn-sm"
                                          title="Deshacer eliminación"
                                          onClick={() => unmarkForRemoval(doc.id)}
                                        >
                                          <i className="bi bi-arrow-counterclockwise"></i>
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          className="btn btn-outline-danger btn-sm"
                                          title="Marcar para eliminar"
                                          onClick={() => markForRemoval(doc.id)}
                                        >
                                          <i className="bi bi-trash"></i>
                                        </button>
                                      )
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                    {/* Pendientes */}
                    <div className="d-flex align-items-center justify-content-between mb-2 mt-3">
                      <span className="fw-semibold">Planos pendientes</span>
                      <span className="text-muted small">{docsPendientesPlanos.length ? `${docsPendientesPlanos.length} por subir` : 'Ninguno'}</span>
                    </div>
                    <div className="table-responsive">
                      <table className="table table-sm align-middle mb-0" style={{ width: '100%' }}>
                        <thead>
                          <tr>
                            <th>Nombre</th>
                            <th className="text-center">Tipo</th>
                            <th className="text-center">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {docsPendientesPlanos.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="text-muted fst-italic">No hay planos agregados.</td>
                            </tr>
                          ) : (
                            docsPendientesPlanos.map(doc => {
                              const badge = badgeForType(doc.tipo);
                              const fecha = doc.addedAt instanceof Date ? doc.addedAt.toLocaleDateString() : '';
                              const peso = bytesToHuman(doc.size);
                              const previewable = canPreview(doc.ext) && !!doc.previewUrl;
                              return (
                                <tr key={doc.id}>
                                  <td>
                                    <div className="d-flex flex-column">
                                      <span className="text-break">
                                        {doc.name}
                                        {!doc.validExt && (
                                          <span className="ms-2 badge text-bg-danger">Extensión no permitida</span>
                                        )}
                                      </span>
                                      <small className="text-muted">{peso}{fecha ? ` · ${fecha}` : ''} · {doc.ext}</small>
                                    </div>
                                  </td>
                                  <td className="text-center">
                                    <div className="d-flex flex-column align-items-center">
                                      <span className={`badge ${badge.className} mb-1`}>{badge.label}</span>
                                      <select
                                        className="form-select form-select-sm"
                                        value="plano"
                                        disabled
                                      >
                                        <option value="plano">{typeByValue['plano'].label}</option>
                                      </select>
                                    </div>
                                  </td>
                                  <td className="text-center p-0">
                                    <button
                                      type="button"
                                      className="btn btn-outline-secondary btn-sm me-1"
                                      title={previewable ? 'Ver' : 'No disponible para vista previa'}
                                      disabled={!previewable}
                                      onClick={() => {
                                        setSelectedDocument(doc);
                                        openPreview(doc);
                                      }}
                                    >
                                      <i className="bi bi-eye"></i>
                                    </button>
                                    {/* Eliminar solo si no es usuario */}
                                    {CAN_EDIT && (
                                      <button
                                        type="button"
                                        className="btn btn-outline-danger btn-sm"
                                        title="Eliminar"
                                        onClick={() => removeDoc(doc.id)}
                                      >
                                        <i className="bi bi-trash"></i>
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======== MANTENIMIENTO ======== */}
          {tab === 'manto' && (
            <div className="mt-2">
              <h6 className="fw-bold mb-2 d-flex align-items-center gap-2">Mantenimiento</h6>
              <div className="row g-3">
                {CAN_EDIT && (
                  <div className="col-12 col-lg-6">
                    <div className="border rounded-3 p-3">
                      <div className="row gy-3">
                        <div className="col-12">
                          <label className="form-label">Tipo de documento</label>
                          <select
                            className="form-select"
                            value={selectedMantoType}
                            onChange={(e) => setSelectedMantoType(e.target.value)}
                          >
                            {MANTO_TYPES.map(t => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                          <div className="form-text">Solo se admite un PDF por tipo (LSA y SMA).</div>
                        </div>
                        <div className="col-12">
                          <label className="form-label">Adjuntar archivo</label>
                          <input
                            type="file"
                            className="form-control"
                            accept=".pdf"
                            onChange={(e) => {
                              if (!e.target.files?.length) return;
                              const tipo = selectedMantoType;
                              const yaGuardado = docsExistentes.some(d => d.tipo === tipo && !docsToRemove.has(d.id));
                              const yaPendiente = docs.some(d => d.tipo === tipo);
                              if (yaGuardado || yaPendiente) {
                                alert('Solo se permite un (1) archivo por tipo (LSA o SMA).');
                                e.target.value = '';
                                return;
                              }
                              addDocs(e.target.files, tipo);
                              e.target.value = '';
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div className={CAN_EDIT ? 'col-12 col-lg-6' : 'col-12'}>
                  <div className="border rounded-3 p-3">
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <span className="fw-semibold">Documentos guardados</span>
                      <span className="text-muted small">{docsExistentes.filter(d => ONLY_MANTO_TYPES.has(d.tipo)).length || 'Ninguno'}</span>
                    </div>
                    <div className="table-responsive mb-3">
                      <table className="table table-sm align-middle mb-0" style={{ width: '100%' }}>
                        <thead>
                          <tr>
                            <th>Nombre</th>
                            <th className="text-center">Tipo</th>
                            <th className="text-center">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {docsExistentes.filter(d => ONLY_MANTO_TYPES.has(d.tipo)).length === 0 ? (
                            <tr><td colSpan={3} className="text-muted fst-italic">No hay documentos guardados.</td></tr>
                          ) : (
                            docsExistentes.filter(d => ONLY_MANTO_TYPES.has(d.tipo)).map(doc => {
                              const badge = badgeForType(doc.tipo);
                              const fecha = doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : '';
                              const peso = bytesToHuman(doc.size);
                              return (
                                <tr key={doc.id}>
                                  <td>
                                    <div className="d-flex flex-column">
                                      <span className="text-break">{doc.name}</span>
                                      <small className="text-muted">{peso}{fecha ? ` · ${fecha}` : ''} · {doc.ext}</small>
                                    </div>
                                  </td>
                                  <td className="text-center">
                                    <span className={`badge ${badge.className}`}>{badge.label}</span>
                                  </td>
                                  <td className="text-center p-0">
                                    <button
                                      type="button"
                                      className="btn btn-outline-secondary btn-sm me-1"
                                      disabled={doc.ext !== '.pdf'}
                                      onClick={() => openPreviewUrl(doc.name, doc.url)}
                                    >
                                      <i className="bi bi-eye"></i>
                                    </button>
                                    {CAN_EDIT && (
                                      isMarkedForRemoval(doc.id) ? (
                                        <button
                                          type="button"
                                          className="btn btn-success btn-sm"
                                          onClick={() => unmarkForRemoval(doc.id)}
                                        >
                                          <i className="bi bi-arrow-counterclockwise"></i>
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          className="btn btn-outline-danger btn-sm"
                                          onClick={() => markForRemoval(doc.id)}
                                        >
                                          <i className="bi bi-trash"></i>
                                        </button>
                                      )
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="d-flex align-items-center justify-content-between mb-2 mt-3">
                      <span className="fw-semibold">Documentos pendientes</span>
                      <span className="text-muted small">{docs.filter(d => ONLY_MANTO_TYPES.has(d.tipo)).length || 'Ninguno'}</span>
                    </div>
                    <div className="table-responsive">
                      <table className="table table-sm align-middle mb-0" style={{ width: '100%' }}>
                        <thead>
                          <tr>
                            <th>Nombre</th>
                            <th className="text-center">Tipo</th>
                            <th className="text-center">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {docs.filter(d => ONLY_MANTO_TYPES.has(d.tipo)).length === 0 ? (
                            <tr><td colSpan={3} className="text-muted fst-italic">No hay documentos agregados.</td></tr>
                          ) : (
                            docs.filter(d => ONLY_MANTO_TYPES.has(d.tipo)).map(doc => {
                              const badge = badgeForType(doc.tipo);
                              const fecha = doc.addedAt instanceof Date ? doc.addedAt.toLocaleDateString() : '';
                              const peso = bytesToHuman(doc.size);
                              return (
                                <tr key={doc.id}>
                                  <td>
                                    <div className="d-flex flex-column">
                                      <span className="text-break">{doc.name}</span>
                                      <small className="text-muted">{peso}{fecha ? ` · ${fecha}` : ''} · {doc.ext}</small>
                                    </div>
                                  </td>
                                  <td className="text-center">
                                    <span className={`badge ${badge.className}`}>{badge.label}</span>
                                  </td>
                                  <td className="text-center p-0">
                                    <button
                                      type="button"
                                      className="btn btn-outline-secondary btn-sm me-1"
                                      disabled={!doc.previewUrl}
                                      onClick={() => openPreview(doc)}
                                    >
                                      <i className="bi bi-eye"></i>
                                    </button>
                                    {CAN_EDIT && (
                                      <button
                                        type="button"
                                        className="btn btn-outline-danger btn-sm"
                                        onClick={() => removeDoc(doc.id)}
                                      >
                                        <i className="bi bi-trash"></i>
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Botones */}
        <div className="mt-3 d-flex justify-content-end gap-2">
          {CAN_EDIT && (
            <button type="submit" className="btn btn-primary">{equipoId ? 'Actualizar' : 'Guardar'}</button>
          )}
        </div>
      </form>

      {/* Modal de previsualización (opaco y con z-index alto) */}
      <PreviewModal
        open={preview.open}
        onClose={closePreview}
        url={preview.url}
        name={preview.name}
        isPdf={preview.isPdf}
      />


      {/* Popup de confirmación para eliminar imagen */}
      <>
        {showDeleteConfirm && deleteButtonRect && (
          <div 
            className="position-fixed" 
            style={{ 
              top: deleteButtonRect.bottom + window.scrollY + 8, 
              left: deleteButtonRect.left + window.scrollX - 120, 
              zIndex: 9999,
              backgroundColor: 'white',
              border: '1px solid #ccc',
              borderRadius: '8px',
              padding: '16px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              minWidth: '260px'
            }}
          >
            <div className="text-center">
              <i className="bi bi-trash text-danger" style={{ fontSize: '1.5rem' }}></i>
              <h6 className="mt-2 mb-2">¿Eliminar imagen?</h6>
              <p className="text-muted small mb-3">Esta acción no se puede deshacer</p>
              <div className="d-flex gap-2 justify-content-end mt-3">
                {CAN_EDIT && (
                  <button type="submit" className="btn btn-primary">
                    Guardar cambios
                  </button>
                )}
                <button type="button" className="btn btn-secondary" onClick={onCancel}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </>

      {/* Webhook Status Alert */}
      {webhookStatus && (
        <div className={`alert alert-${webhookStatus.type === 'success' ? 'success' : 'warning'} alert-dismissible fade show position-fixed`} 
             style={{top: '20px', right: '20px', zIndex: 9999, minWidth: '300px'}}>
          <i className={`bi bi-${webhookStatus.type === 'success' ? 'check-circle' : 'exclamation-triangle'}`}></i>
          {webhookStatus.message}
          <button type="button" className="btn-close" onClick={() => setWebhookStatus(null)}></button>
        </div>
      )}
      
      {/* Upload Webhook Status Alert suprimido a petición: se mantiene lógica interna silenciosa */}

      {/* Overlay para el popup */}
      {showDeleteConfirm && (
        <div 
          className="position-fixed top-0 start-0 w-100 h-100"
          style={{ backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 9998 }}
          onClick={() => {
            setShowDeleteConfirm(false);
            setDeleteButtonRect(null);
          }}
        ></div>
      )}

      {/* Overlay para el popup */}
      {showDeleteConfirm && (
        <div 
          className="position-fixed top-0 start-0 w-100 h-100"
          style={{ backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 9998 }}
          onClick={() => {
            setShowDeleteConfirm(false);
            setDeleteButtonRect(null);
          }}
        ></div>
      )}



      
      {/* MODAL LOCAL (anclado al contenedor del formulario) */}
      {showDeleteModal && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
          }}
        >
          {/* Backdrop semi-transparente */}
          <div className="FondoOscuro" onClick={() => setShowDeleteModal(false)} />

          {/* Contenido centrado relativo al contenedor */}
          <div
            className="ModalEliminarEquipo"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              borderRadius: 12,
              boxShadow: '0 10px 30px rgba(0,0,0,.25)',
              width: 440,
              maxWidth: '92%',
              padding: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h5 className="text-danger mb-2">Eliminar equipo</h5>
            <p className="mb-2">
              Esta acción <strong>no se puede deshacer</strong>. Para confirmar, escribe el nombre exacto del equipo.
            </p>

            <div className="mb-2 small text-muted">Nombre del equipo actual</div>
            <div className="fw-semibold mb-3">{form?.nombre_equipo || '(sin nombre)'}</div>

            <input
              type="text"
              className="form-control mb-3"
              placeholder="Escribe el nombre exactamente igual"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
            />

            <div className="d-flex justify-content-end gap-2">
              <button className="btn btn-secondary" onClick={() => setShowDeleteModal(false)}>
                Cancelar
              </button>

              <button
                className="btn btn-danger"
                onClick={async () => {
                  try {
                    const actual = String(form?.nombre_equipo || '').trim();
                    if (confirmName.trim() !== actual) {
                      alert('El nombre no coincide. Escríbelo exactamente igual.');
                      return;
                    }
                    if (!equipoId) {
                      alert('No hay equipo a eliminar.');
                      return;
                    }

                    await api.delete(`${API_BASE}/api/equipos/${equipoId}/`);

                    setShowDeleteModal(false);
                    pushToast('Equipo eliminado correctamente', 'success');
                    onDeleted?.(Number(equipoId));
                    onCancel?.();
                  } catch (err) {
                    console.error(err);
                    const status = err?.response?.status;
                    alert(`No se pudo eliminar el equipo${status ? ` (HTTP ${status})` : ''}.`);
                  }
                }}
              >
                Eliminar definitivamente
              </button>
            </div>
          </div>
        </div>
      )}

      <Toaster toasts={toasts} onClose={removeToast} />
    </div>
  );
};
