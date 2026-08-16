import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Swal from 'sweetalert2';
import {
  fetchBuques,
  fetchSeccionesCasco,
  fetchInspecciones,
  crearInspeccion,
  fetchInspeccionDetalle,
  subirFotoInspeccion,
  fetchFotoDetalle,
  reintentarFoto,
  eliminarFoto,
  iniciarAnalisis,
  eliminarInspeccion,
  abrirStreamInspeccion,
} from '../services/api';
import { API_BASE } from '../config';
import CameraCapture from './CameraCapture';
import './AIInspection.css';
import './RondaEquipo-iOS.css';

// ─────────────────────────────────────────────────────────────────────────────
// i18n
// ─────────────────────────────────────────────────────────────────────────────
const LANG_KEY = 'app_lang';

const i18n = {
  es: {
    title: 'Inspección IA',
    selectVessel: 'Seleccionar buque',
    newInspection: 'Nueva inspección',
    description: 'Descripción',
    inspector: 'Inspector',
    startInspection: 'Iniciar inspección',
    uploadPhoto: 'Subir foto',
    takePhoto: 'Tomar foto',
    results: 'Resultados',
    pending: 'Pendiente',
    processing: 'En proceso',
    completed: 'Completada',
    error: 'Error',
    retry: 'Reintentar',
    noDetections: 'Sin anomalías detectadas',
    photos: 'fotos',
    section: 'Sección',
    confidence: 'Confianza',
    detections: 'Detecciones',
    viewResults: 'Ver resultados',
    backToSections: 'Volver a secciones',
    backToList: 'Volver al listado',
    noInspections: 'No hay inspecciones registradas.',
    noShips: 'No hay buques registrados.',
    originalImage: 'Imagen original',
    annotatedImage: 'Imagen anotada',
    inferenceTime: 'Tiempo de inferencia',
    cancel: 'Cancelar',
    created: 'Creada',
    totalPhotos: 'Total fotos',
    allCompleted: 'Todas las fotos procesadas',
    someProcessing: 'procesando...',
    deletePhoto: 'Eliminar foto',
    startAnalysis: 'Iniciar análisis',
    confirmDelete: '¿Eliminar esta foto? Esta acción no se puede deshacer.',
    deleteBtn: 'Eliminar',
    noPendingPhotos: 'No hay fotos pendientes de análisis.',
    gallery: 'Galería',
    deleteInspeccion: 'Eliminar inspección',
    confirmDeleteInspeccion: '¿Eliminar esta inspección y todas sus fotos? Esta acción no se puede deshacer.',
    uploadLimitTitle: 'Límite alcanzado',
    uploadLimitMsg: (n) => `${n} foto${n !== 1 ? 's' : ''} en proceso. Espera a que finalicen para subir más.`,
  },
  en: {
    title: 'AI Inspection',
    selectVessel: 'Select vessel',
    newInspection: 'New inspection',
    description: 'Description',
    inspector: 'Inspector',
    startInspection: 'Start inspection',
    uploadPhoto: 'Upload photo',
    takePhoto: 'Take photo',
    results: 'Results',
    pending: 'Pending',
    processing: 'Processing',
    completed: 'Completed',
    error: 'Error',
    retry: 'Retry',
    noDetections: 'No anomalies detected',
    photos: 'photos',
    section: 'Section',
    confidence: 'Confidence',
    detections: 'Detections',
    viewResults: 'View results',
    backToSections: 'Back to sections',
    backToList: 'Back to list',
    noInspections: 'No inspections registered.',
    noShips: 'No vessels registered.',
    originalImage: 'Original image',
    annotatedImage: 'Annotated image',
    inferenceTime: 'Inference time',
    cancel: 'Cancel',
    created: 'Created',
    totalPhotos: 'Total photos',
    allCompleted: 'All photos processed',
    someProcessing: 'processing...',
    deletePhoto: 'Delete photo',
    startAnalysis: 'Start analysis',
    confirmDelete: 'Delete this photo? This action cannot be undone.',
    deleteBtn: 'Delete',
    noPendingPhotos: 'No photos pending analysis.',
    gallery: 'Gallery',
    deleteInspeccion: 'Delete inspection',
    confirmDeleteInspeccion: 'Delete this inspection and all its photos? This action cannot be undone.',
    uploadLimitTitle: 'Limit reached',
    uploadLimitMsg: (n) => `${n} photo${n !== 1 ? 's' : ''} in progress. Wait for them to finish before uploading more.`,
  },
};

const loadLang = () => localStorage.getItem(LANG_KEY) || navigator.language?.slice(0, 2) || 'es';

// ─────────────────────────────────────────────────────────────────────────────
// Clases de anomalías — labels legibles para el frontend
// ─────────────────────────────────────────────────────────────────────────────
const CLASS_LABELS = {
  sea_chest_grating: { es: 'Rejilla de toma de mar', en: 'Sea chest grating' },
  paint_peel: { es: 'Descascaramiento de pintura', en: 'Paint peel' },
  over_board_valve: { es: 'Válvula de descarga', en: 'Over board valve' },
  defect: { es: 'Defecto', en: 'Defect' },
  corrosion: { es: 'Corrosión', en: 'Corrosion' },
  propeller: { es: 'Hélice', en: 'Propeller' },
  anode: { es: 'Ánodo', en: 'Anode' },
  bilge_keel: { es: 'Quilla de balance', en: 'Bilge keel' },
  marine_growth: { es: 'Incrustación marina', en: 'Marine growth' },
  ship_hull: { es: 'Casco del buque', en: 'Ship hull' },
};

const classLabel = (className, lang) => CLASS_LABELS[className]?.[lang] || className;

// ─────────────────────────────────────────────────────────────────────────────
// Severidad — solo para clases que representan fallas/anomalías reales
// Las clases estructurales (ship_hull, bilge_keel, propeller, etc.) no tienen
// severidad asignada y se muestran sin badge.
// ─────────────────────────────────────────────────────────────────────────────
const SEVERITY_MAP = {
  corrosion:    { level: 'critical', color: '#dc2626', label: { es: 'Crítico', en: 'Critical' } },
  defect:       { level: 'high',     color: '#ea580c', label: { es: 'Alto',    en: 'High'     } },
  marine_growth:{ level: 'medium',   color: '#d97706', label: { es: 'Medio',   en: 'Medium'   } },
  paint_peel:   { level: 'low',      color: '#2563eb', label: { es: 'Bajo',    en: 'Low'      } },
};

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];

/** Retorna el objeto de severidad para una clase, o null si no es una anomalía. */
const getSeverity = (className) => SEVERITY_MAP[className] || null;

/** Retorna la severidad más alta encontrada entre las detecciones de una foto. */
const getPhotoSeverity = (detections) => {
  let worst = null;
  for (const det of detections) {
    const sev = SEVERITY_MAP[det.class_name];
    if (!sev) continue;
    if (!worst || SEVERITY_ORDER.indexOf(sev.level) < SEVERITY_ORDER.indexOf(worst.level)) {
      worst = sev;
    }
  }
  return worst;
};

// ─────────────────────────────────────────────────────────────────────────────
// Colores por estado
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  pendiente: '#f59e0b',
  en_proceso: '#3b82f6',
  completada: '#10b981',
  error: '#ef4444',
};

// Debe coincidir con VISION_RATE_LIMIT_MAX_CONCURRENT en backend/settings.py
const CONCURRENT_LIMIT = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────
export default function AIInspection() {
  const { inspeccionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [lang, setLang] = useState(loadLang);
  const t = i18n[lang] || i18n.es;

  // Escuchar cambio de idioma global
  useEffect(() => {
    const handler = (e) => setLang(e.detail?.lang || loadLang());
    window.addEventListener('app:language', handler);
    return () => window.removeEventListener('app:language', handler);
  }, []);

  // Determinar fase según la URL
  const phase = useMemo(() => {
    const path = location.pathname;
    if (path.endsWith('/fotos')) return 'fotos';
    if (path.endsWith('/resultados')) return 'resultados';
    if (path.endsWith('/nueva')) return 'nueva';
    if (inspeccionId) return 'fotos'; // default si hay ID
    return 'lista'; // /ai-inspection
  }, [location.pathname, inspeccionId]);

  return (
    <div className="container-xl ai-inspection">
      <div className="page-header d-flex align-items-center mb-4">
        <h2 className="page-title">{t.title}</h2>
        <div className="ms-auto d-flex gap-2">
          {phase !== 'lista' && (
            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={() => navigate('/ai-inspection')}
            >
              <i className="bi bi-arrow-left me-1" />
              {t.backToList}
            </button>
          )}
          {phase === 'lista' && (
            <>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => navigate('/ai-inspection/nueva')}
              >
                <i className="bi bi-plus-lg me-1" />
                {t.newInspection}
              </button>
            </>
          )}
        </div>
      </div>

      {phase === 'lista' && <InspeccionLista t={t} lang={lang} navigate={navigate} />}
      {phase === 'nueva' && <NuevaInspeccion t={t} lang={lang} navigate={navigate} />}
      {phase === 'fotos' && <SubirFotos t={t} lang={lang} navigate={navigate} inspeccionId={inspeccionId} />}
      {phase === 'resultados' && <Resultados t={t} lang={lang} navigate={navigate} inspeccionId={inspeccionId} />}
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════════
// Fase: Lista de inspecciones recientes
// ═════════════════════════════════════════════════════════════════════════════
function InspeccionLista({ t, lang, navigate }) {
  const [inspecciones, setInspecciones] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchInspecciones();
        setInspecciones(data);
      } catch (err) {
        console.error('[AIInspection] Error cargando inspecciones:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleDelete = async (e, inspeccionId) => {
    e.stopPropagation();
    const result = await Swal.fire({
      icon: 'warning',
      text: t.confirmDeleteInspeccion,
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: t.deleteBtn,
      cancelButtonText: t.cancel,
    });
    if (!result.isConfirmed) return;
    try {
      await eliminarInspeccion(inspeccionId);
      setInspecciones((prev) => prev.filter((i) => i.id !== inspeccionId));
    } catch (err) {
      console.error('[AIInspection] Error eliminando inspección:', err);
      Swal.fire({ icon: 'error', text: err?.response?.data?.error || 'Error eliminando inspección' });
    }
  };

  if (loading) return <div className="text-center py-5"><div className="spinner-border" /></div>;

  if (!inspecciones.length) {
    return (
      <div className="text-center text-muted py-5">
        <p>{t.noInspections}</p>
        <button className="btn btn-primary" onClick={() => navigate('/ai-inspection/nueva')}>
          <i className="bi bi-plus-lg me-1" />
          {t.newInspection}
        </button>
      </div>
    );
  }

  return (
    <div className="row g-3">
      {inspecciones.map((insp) => (
        <div key={insp.id} className="col-sm-6 col-lg-4">
          <div
            className="card ai-inspeccion-card h-100 d-flex flex-column"
            onClick={() => navigate(`/ai-inspection/${insp.id}/resultados`)}
          >
            <div className="card-body d-flex flex-column">
              <h5 className="card-title">{insp.buque_nombre}</h5>
              {insp.descripcion && <p className="card-text text-muted small">{insp.descripcion}</p>}
              <div className="d-flex justify-content-between small text-muted">
                <span>{t.created}: {new Date(insp.fecha_creacion).toLocaleDateString(lang)}</span>
                <span>{insp.total_fotos} {t.photos}</span>
              </div>
              {insp.tomado_por && <div className="small text-muted mt-1">{insp.tomado_por}</div>}
              <div className="mt-auto pt-2 border-top d-flex justify-content-end">
                <button
                  className="btn btn-outline-danger btn-sm py-0 px-2"
                  style={{ fontSize: '0.75rem' }}
                  onClick={(e) => handleDelete(e, insp.id)}
                >
                  <i className="bi bi-trash me-1" />
                  {t.deleteInspeccion}
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════════
// Fase 1: Nueva inspección — seleccionar buque + crear
// ═════════════════════════════════════════════════════════════════════════════
function NuevaInspeccion({ t, lang, navigate }) {
  const [buques, setBuques] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buqueId, setBuqueId] = useState(null);
  const [descripcion, setDescripcion] = useState('');
  const [tomadoPor, setTomadoPor] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchBuques();
        setBuques(data);
      } catch (err) {
        console.error('[AIInspection] Error cargando buques:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleCreate = async () => {
    if (!buqueId) {
      Swal.fire({ icon: 'warning', text: t.selectVessel });
      return;
    }
    setCreating(true);
    try {
      const insp = await crearInspeccion({ buqueId, descripcion, tomadoPor });
      navigate(`/ai-inspection/${insp.id}/fotos`);
    } catch (err) {
      console.error('[AIInspection] Error creando inspección:', err);
      Swal.fire({ icon: 'error', text: err?.response?.data?.error || 'Error creando inspección' });
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="text-center py-5"><div className="spinner-border" /></div>;

  if (!buques.length) {
    return <div className="text-center text-muted py-5"><p>{t.noShips}</p></div>;
  }

  return (
    <div>
      {/* Paso 1: seleccionar buque */}
      <h4 className="mb-3">{t.selectVessel}</h4>
      <div className="row g-3 mb-4">
        {buques.map((b) => (
          <div key={b.id} className="col-sm-6 col-lg-4">
            <div
              className={`card ai-buque-card h-100 ${buqueId === b.id ? 'border-primary selected' : ''}`}
              onClick={() => setBuqueId(b.id)}
              style={{ cursor: 'pointer' }}
            >
              <div className="card-body">
                <h5 className="card-title">{b.nombre}</h5>
                {b.matricula && <p className="card-text text-muted small">{b.matricula}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Paso 2: datos opcionales + crear */}
      {buqueId && (
        <div className="card p-3 mb-4">
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">{t.description}</label>
              <input
                className="form-control"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder={`${t.description} (${lang === 'es' ? 'opcional' : 'optional'})`}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label">{t.inspector}</label>
              <input
                className="form-control"
                value={tomadoPor}
                onChange={(e) => setTomadoPor(e.target.value)}
                placeholder={t.inspector}
              />
            </div>
          </div>
          <div className="mt-3">
            <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
              {creating
                ? <span className="spinner-border spinner-border-sm me-2" />
                : <i className="bi bi-play-fill me-1" />}
              {t.startInspection}
            </button>
            <button className="btn btn-outline-secondary ms-2" onClick={() => navigate('/ai-inspection')}>
              <i className="bi bi-x-lg me-1" />
              {t.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════════
// Fase 2: Subir fotos por sección
// ═════════════════════════════════════════════════════════════════════════════
function SubirFotos({ t, lang, navigate, inspeccionId }) {
  const [secciones, setSecciones] = useState([]);
  const [inspeccion, setInspeccion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [seccionActiva, setSeccionActiva] = useState(null);
  const [uploadingFiles, setUploadingFiles] = useState(0);
  const uploading = uploadingFiles > 0;
  const [analizando, setAnalizando] = useState(false);
  const fileInputRef = useRef(null);

  // Cargar secciones e inspección
  useEffect(() => {
    (async () => {
      try {
        const [secData, inspData] = await Promise.all([
          fetchSeccionesCasco(),
          fetchInspeccionDetalle(inspeccionId),
        ]);
        setSecciones(secData);
        setInspeccion(inspData);
      } catch (err) {
        console.error('[AIInspection] Error cargando datos:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [inspeccionId]);

  // SSE: stream en tiempo real de cambios de estado de las fotos.
  // Reemplaza el polling cada 3s. Una sola conexión HTTP por inspección abierta.
  useEffect(() => {
    if (!inspeccionId) return;

    const es = abrirStreamInspeccion(inspeccionId, {
      onUpdate: (payload) => {
        setInspeccion((prev) => {
          if (!prev || !prev.fotos) return prev;
          const fotos = prev.fotos.map((f) =>
            f.id === payload.foto_id ? { ...f, ...payload, id: f.id } : f
          );
          return { ...prev, fotos };
        });
      },
      onCreated: (foto) => {
        setInspeccion((prev) => {
          if (!prev) return prev;
          const existe = prev.fotos?.some((f) => f.id === foto.id);
          if (existe) return prev; // ignorar duplicado (eco propio)
          return { ...prev, fotos: [...(prev.fotos || []), foto] };
        });
      },
      onDeleted: ({ foto_id }) => {
        setInspeccion((prev) => {
          if (!prev || !prev.fotos) return prev;
          return { ...prev, fotos: prev.fotos.filter((f) => f.id !== foto_id) };
        });
      },
      onError: (err) => {
        console.warn('[AIInspection] SSE error (reintentando)', err);
      },
    });

    return () => es.close();
  }, [inspeccionId]);

  // Contar fotos por sección
  const fotosPorSeccion = useMemo(() => {
    const map = {};
    inspeccion?.fotos?.forEach((f) => {
      const sid = f.seccion?.id;
      if (!map[sid]) map[sid] = [];
      map[sid].push(f);
    });
    return map;
  }, [inspeccion]);

  const handleUpload = async (file) => {
    if (!seccionActiva || !file) return;
    setUploadingFiles((n) => n + 1);
    try {
      await subirFotoInspeccion(inspeccionId, {
        imagen: file,
        seccionId: seccionActiva.id,
      });
      // SSE foto-created actualiza el estado — no es necesario recargar
    } catch (err) {
      console.error('[AIInspection] Error subiendo foto:', err);
      Swal.fire({ icon: 'error', text: err?.response?.data?.error || 'Error subiendo foto' });
    } finally {
      setUploadingFiles((n) => Math.max(0, n - 1));
    }
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    e.target.value = '';
    if (!files.length || !seccionActiva) return;

    const availableSlots = Math.max(0, CONCURRENT_LIMIT - activeFotos);
    if (availableSlots === 0) return;

    const toUpload = files.slice(0, availableSlots);
    const skipped = files.length - toUpload.length;

    if (skipped > 0) {
      await Swal.fire({
        icon: 'info',
        title: lang === 'es' ? 'Límite de procesamiento' : 'Processing limit',
        html: lang === 'es'
          ? `Seleccionaste <strong>${files.length}</strong> imágenes, pero solo hay <strong>${toUpload.length}</strong> espacio${toUpload.length !== 1 ? 's' : ''} disponible${toUpload.length !== 1 ? 's' : ''} (límite: ${CONCURRENT_LIMIT} fotos en proceso simultáneo).<br><br>Se subirán las primeras <strong>${toUpload.length}</strong>. Cuando finalice su procesamiento podrás cargar las restantes.`
          : `You selected <strong>${files.length}</strong> images, but only <strong>${toUpload.length}</strong> slot${toUpload.length !== 1 ? 's are' : ' is'} available (limit: ${CONCURRENT_LIMIT} simultaneous photos).<br><br>The first <strong>${toUpload.length}</strong> will be uploaded. Once processed, you can upload the rest.`,
        confirmButtonText: lang === 'es' ? 'Entendido' : 'Got it',
        confirmButtonColor: '#003366',
      });
    }

    await Promise.all(toUpload.map((f) => handleUpload(f)));
  };

  const handleDelete = async (fotoId) => {
    const result = await Swal.fire({
      icon: 'warning',
      text: t.confirmDelete,
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: t.deleteBtn,
      cancelButtonText: t.cancel,
    });
    if (!result.isConfirmed) return;
    try {
      await eliminarFoto(fotoId);
      const data = await fetchInspeccionDetalle(inspeccionId);
      setInspeccion(data);
    } catch (err) {
      console.error('[AIInspection] Error eliminando foto:', err);
      Swal.fire({ icon: 'error', text: err?.response?.data?.error || 'Error eliminando foto' });
    }
  };

  const handleIniciarAnalisis = async () => {
    setAnalizando(true);
    try {
      await iniciarAnalisis(inspeccionId);
      const data = await fetchInspeccionDetalle(inspeccionId);
      setInspeccion(data);
    } catch (err) {
      console.error('[AIInspection] Error iniciando análisis:', err);
      Swal.fire({ icon: 'error', text: err?.response?.data?.error || t.noPendingPhotos });
    } finally {
      setAnalizando(false);
    }
  };

  const handleTakePhoto = () => {
    if (!seccionActiva) return;
    let root = null;
    let container = null;

    Swal.fire({
      html: '<div id="camera-swal-root" class="camera-swal-container"></div>',
      width: 'auto',
      maxWidth: '600px',
      padding: '0',
      showConfirmButton: false,
      showCloseButton: true,
      backdrop: true,
      customClass: {
        popup: 'camera-swal-popup',
        closeButton: 'camera-swal-close'
      },
      allowOutsideClick: true,
      willOpen: () => {
        const popup = document.querySelector('.swal2-popup.camera-swal-popup');
        if (popup) popup.classList.add('narrow');
      },
      didOpen: () => {
        document.body.classList.add('camera-swal-open');
        container = document.getElementById('camera-swal-root');
        if (container) {
          root = ReactDOM.createRoot(container);
          root.render(
            <CameraCapture
              filePrefix="foto_inspeccion"
              onPhotoTaken={(file) => {
                Swal.close();
                handleUpload(file);
              }}
              onCancel={() => Swal.close()}
              t={t}
            />
          );
        }
        setTimeout(() => {
          try {
            const vid = document.querySelector('#camera-swal-root video');
            if (vid && vid.paused) vid.play().catch(() => {});
          } catch (_) {}
        }, 900);
      },
      willClose: () => {
        if (root) { root.unmount(); root = null; }
        try {
          const videos = document.querySelectorAll('#camera-swal-root video');
          videos.forEach(v => {
            const stream = v.srcObject;
            if (stream && typeof stream.getTracks === 'function') {
              stream.getTracks().forEach(tr => { try { tr.stop(); } catch (_) {} });
            }
            try { v.srcObject = null; } catch (_) {}
          });
        } catch (_) {}
        const delayedForce = () => {
          try {
            document.querySelectorAll('video').forEach(v => {
              const s = v.srcObject;
              if (s && typeof s.getTracks === 'function') {
                s.getTracks().forEach(tr => { try { tr.stop(); } catch(_){} });
              }
              try { v.srcObject = null; } catch(_){}
            });
          } catch(_){}
        };
        setTimeout(delayedForce, 150);
        setTimeout(delayedForce, 600);
        container = null;
        document.body.classList.remove('camera-swal-open');
      }
    });
  };

  const pendingFotos = inspeccion?.fotos?.filter((f) => f.estado === 'pendiente').length || 0;

  // Fotos activas = pendiente + en_proceso. Cuando alcanza CONCURRENT_LIMIT
  // el backend rechaza nuevos dispatches con 429 — bloqueamos el botón antes.
  const activeFotos = inspeccion?.fotos?.filter(
    (f) => f.estado === 'pendiente' || f.estado === 'en_proceso'
  ).length || 0;
  const uploadBlocked = activeFotos >= CONCURRENT_LIMIT;

  if (loading) return <div className="text-center py-5"><div className="spinner-border" /></div>;

  return (
    <div>
      <div className="d-flex align-items-center flex-wrap gap-2 mb-3">
        <h4 className="mb-0">
          {inspeccion?.buque_nombre} — {t.uploadPhoto}
        </h4>
        <div className="ms-auto d-flex gap-2">
          <button
            className="btn btn-primary btn-sm"
            onClick={handleIniciarAnalisis}
            disabled={analizando || pendingFotos === 0}
            title={t.startAnalysis}
          >
            {analizando
              ? <span className="spinner-border spinner-border-sm me-1" />
              : <i className="bi bi-cpu me-1" />}
            {t.startAnalysis}
            {pendingFotos > 0 && !analizando && (
              <span className="badge bg-white text-primary ms-1" style={{ fontSize: '0.65rem' }}>
                {pendingFotos}
              </span>
            )}
          </button>
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={() => navigate(`/ai-inspection/${inspeccionId}/resultados`)}
          >
            {t.viewResults}
            <i className="bi bi-arrow-right ms-1" />
          </button>
        </div>
      </div>

      {/* Grid de secciones */}
      <div className="row g-2 mb-4">
        {secciones.map((sec) => {
          const fotos = fotosPorSeccion[sec.id] || [];
          const isActive = seccionActiva?.id === sec.id;
          return (
            <div key={sec.id} className="col-6 col-sm-4 col-md-3 col-lg-2">
              <div
                className={`card ai-seccion-card text-center p-2 ${isActive ? 'selected' : ''}`}
                onClick={() => setSeccionActiva(isActive ? null : sec)}
              >
                <div className="fw-bold small">{sec.codigo}</div>
                <div className="text-muted" style={{ fontSize: '0.7rem' }}>{sec.nombre}</div>
                {fotos.length > 0 && (
                  <span className="badge bg-primary mt-1">{fotos.length} {t.photos}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Panel de sección activa */}
      {seccionActiva && (
        <div className="ai-seccion-panel mb-4">
          <div className="ai-seccion-panel-header">
            <h5>{seccionActiva.codigo} — {seccionActiva.nombre}</h5>
            {seccionActiva.descripcion && (
              <p>{seccionActiva.descripcion}</p>
            )}
          </div>
          <div className="p-3">
          <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
            <button
              className="btn ai-btn-upload btn-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || uploadBlocked}
              title={uploadBlocked ? t.uploadLimitTitle : undefined}
            >
              {uploading
                ? <span className="spinner-border spinner-border-sm me-1" />
                : <i className="bi bi-cloud-upload me-1" />}
              {t.uploadPhoto}
              {uploading && uploadingFiles > 1 && (
                <span className="badge bg-white text-dark ms-1" style={{ fontSize: '0.65rem' }}>
                  {uploadingFiles}
                </span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="d-none"
              onChange={handleFileChange}
            />
            <button
              className="btn ai-btn-camera btn-sm"
              onClick={handleTakePhoto}
              disabled={uploading || uploadBlocked}
              title={uploadBlocked ? t.uploadLimitTitle : undefined}
            >
              <i className="bi bi-camera me-1" />
              {t.takePhoto}
            </button>
            {uploadBlocked && (
              <span className="ai-upload-limit-msg">
                <i className="bi bi-hourglass-split" />
                {t.uploadLimitMsg(activeFotos)}
              </span>
            )}
          </div>

          {/* Fotos de esta sección */}
          {(fotosPorSeccion[seccionActiva.id] || []).map((foto) => (
            <FotoCard
              key={foto.id}
              foto={foto}
              t={t}
              lang={lang}
              compact
              onDelete={() => handleDelete(foto.id)}
            />
          ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════════
// Fase 3: Resultados
// ═════════════════════════════════════════════════════════════════════════════
function Resultados({ t, lang, navigate, inspeccionId }) {
  const [inspeccion, setInspeccion] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const data = await fetchInspeccionDetalle(inspeccionId);
      setInspeccion(data);
    } catch (err) {
      console.error('[AIInspection] Error cargando resultados:', err);
    } finally {
      setLoading(false);
    }
  }, [inspeccionId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // SSE: empuja cambios de estado, creación y eliminación en tiempo real
  useEffect(() => {
    if (!inspeccionId) return;
    const es = abrirStreamInspeccion(inspeccionId, {
      onUpdate: (payload) => {
        setInspeccion((prev) => {
          if (!prev || !prev.fotos) return prev;
          const fotos = prev.fotos.map((f) =>
            f.id === payload.foto_id ? { ...f, ...payload, id: f.id } : f
          );
          return { ...prev, fotos };
        });
      },
      onCreated: (foto) => {
        setInspeccion((prev) => {
          if (!prev) return prev;
          const existe = prev.fotos?.some((f) => f.id === foto.id);
          if (existe) return prev;
          return { ...prev, fotos: [...(prev.fotos || []), foto] };
        });
      },
      onDeleted: ({ foto_id }) => {
        setInspeccion((prev) => {
          if (!prev || !prev.fotos) return prev;
          return { ...prev, fotos: prev.fotos.filter((f) => f.id !== foto_id) };
        });
      },
      onError: (err) => {
        console.warn('[Resultados] SSE error (reintentando)', err);
      },
    });
    return () => es.close();
  }, [inspeccionId]);

  const handleRetry = async (fotoId) => {
    try {
      await reintentarFoto(fotoId);
      await fetchData();
    } catch (err) {
      console.error('[AIInspection] Error reintentando:', err);
      Swal.fire({ icon: 'error', text: err?.response?.data?.error || 'Error' });
    }
  };

  const handleDelete = async (fotoId) => {
    const result = await Swal.fire({
      icon: 'warning',
      text: t.confirmDelete,
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: t.deleteBtn,
      cancelButtonText: t.cancel,
    });
    if (!result.isConfirmed) return;
    try {
      await eliminarFoto(fotoId);
      await fetchData();
    } catch (err) {
      console.error('[AIInspection] Error eliminando foto:', err);
      Swal.fire({ icon: 'error', text: err?.response?.data?.error || 'Error eliminando foto' });
    }
  };

  const handleDeleteInspeccion = async () => {
    const result = await Swal.fire({
      icon: 'warning',
      text: t.confirmDeleteInspeccion,
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: t.deleteBtn,
      cancelButtonText: t.cancel,
    });
    if (!result.isConfirmed) return;
    try {
      await eliminarInspeccion(inspeccionId);
      navigate('/ai-inspection');
    } catch (err) {
      console.error('[AIInspection] Error eliminando inspección:', err);
      Swal.fire({ icon: 'error', text: err?.response?.data?.error || 'Error eliminando inspección' });
    }
  };

  if (loading) return <div className="text-center py-5"><div className="spinner-border" /></div>;
  if (!inspeccion) return <div className="text-center text-muted py-5">No encontrada</div>;

  // Agrupar fotos por sección
  const porSeccion = {};
  inspeccion.fotos?.forEach((f) => {
    const key = f.seccion?.codigo || 'SIN-SECCION';
    if (!porSeccion[key]) porSeccion[key] = { seccion: f.seccion, fotos: [] };
    porSeccion[key].fotos.push(f);
  });

  const pendingCount = inspeccion.fotos?.filter(
    (f) => f.estado === 'pendiente' || f.estado === 'en_proceso'
  ).length || 0;

  return (
    <div>
      <div className="d-flex align-items-center mb-3">
        <div>
          <h4 className="mb-0">{inspeccion.buque_nombre} — {t.results}</h4>
          {inspeccion.descripcion && <p className="text-muted small mb-0">{inspeccion.descripcion}</p>}
        </div>
        <div className="ms-auto d-flex gap-2 align-items-center">
          {pendingCount > 0 && (
            <span className="badge bg-warning text-dark">
              <span className="spinner-border spinner-border-sm me-1" style={{ width: 12, height: 12 }} />
              {pendingCount} {t.someProcessing}
            </span>
          )}
          <button
            className="btn btn-outline-primary btn-sm"
            onClick={() => navigate(`/ai-inspection/${inspeccionId}/fotos`)}
          >
            <i className="bi bi-plus-lg me-1" />
            {t.uploadPhoto}
          </button>
          <button
            className="btn btn-outline-danger btn-sm"
            onClick={handleDeleteInspeccion}
          >
            <i className="bi bi-trash me-1" />
            {t.deleteInspeccion}
          </button>
        </div>
      </div>

      {Object.keys(porSeccion).length === 0 && (
        <div className="ai-empty-state">
          <p>{t.noDetections}</p>
          <button
            className="btn ai-btn-upload"
            onClick={() => navigate(`/ai-inspection/${inspeccionId}/fotos`)}
          >
            <i className="bi bi-cloud-upload me-1" />
            {t.uploadPhoto}
          </button>
        </div>
      )}

      {Object.entries(porSeccion).map(([codigo, { seccion, fotos }]) => (
        <div key={codigo} className="mb-4">
          <h5 className="ai-resultados-section-title">
            {seccion?.codigo} — {seccion?.nombre}
          </h5>
          <div className="row g-3">
            {fotos.map((foto) => (
              <div key={foto.id} className="col-md-6 col-lg-4">
                <FotoCard
                  foto={foto}
                  t={t}
                  lang={lang}
                  onRetry={() => handleRetry(foto.id)}
                  onDelete={() => handleDelete(foto.id)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════════
// Componente reutilizable: Card de foto
// ═════════════════════════════════════════════════════════════════════════════
function FotoCard({ foto, t, lang, onRetry, onDelete, compact }) {
  const [showOriginal, setShowOriginal] = useState(false);

  const detections = foto.detecciones || [];
  const detectionCount = detections.length;
  const inferenceMs = foto.tiempo_inferencia_ms;
  const severidad = foto.severidad ? SEVERITY_MAP[foto.severidad] : null;
  const statusColor = STATUS_COLORS[foto.estado] || '#6b7280';

  // En modo compacto (Fase 2), mostrar imagen completa con toggle
  if (compact) {
    const canToggle = !!(foto.imagen_anotada && foto.imagen_original);
    const imgSrc = showOriginal
      ? foto.imagen_original
      : (foto.imagen_anotada || foto.imagen_original);

    return (
      <div className="ai-foto-compact">
        <div className="ai-foto-compact-header">
          <span className="badge" style={{ backgroundColor: statusColor, color: '#fff', fontSize: '0.65rem' }}>
            {t[foto.estado] || foto.estado}
          </span>
          {detectionCount > 0 && (
            <span className="text-muted small">{detectionCount} {t.detections?.toLowerCase()}</span>
          )}
          {(foto.estado === 'pendiente' || foto.estado === 'en_proceso') && (
            <span className="spinner-border spinner-border-sm text-primary" style={{ width: 14, height: 14 }} />
          )}
          {onDelete && (
            <button
              className="btn btn-sm btn-outline-danger ms-auto py-0 px-1"
              style={{ lineHeight: 1.4 }}
              onClick={() => onDelete(foto.id)}
              title={t.deletePhoto}
            >
              <i className="bi bi-trash" />
            </button>
          )}
        </div>
        {imgSrc && (
          <img
            src={imgSrc}
            alt=""
            style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain' }}
          />
        )}
        {canToggle && (
          <div className="ai-foto-toggle">
            <button
              className={`btn btn-sm ${!showOriginal ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setShowOriginal(false)}
            >
              {t.annotatedImage}
            </button>
            <button
              className={`btn btn-sm ${showOriginal ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setShowOriginal(true)}
            >
              {t.originalImage}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card ai-foto-card h-100">
      {/* Imagen */}
      <div className="position-relative" style={{ cursor: foto.imagen_anotada ? 'pointer' : 'default' }}
        onClick={() => foto.imagen_anotada && setShowOriginal(!showOriginal)}
      >
        {foto.estado === 'completada' && foto.imagen_anotada ? (
          <img
            src={showOriginal ? foto.imagen_original : foto.imagen_anotada}
            alt={showOriginal ? t.originalImage : t.annotatedImage}
            className="card-img-top"
            style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
          />
        ) : foto.imagen_original ? (
          <img
            src={foto.imagen_original}
            alt={t.originalImage}
            className="card-img-top"
            style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
          />
        ) : null}

        {/* Badge de estado */}
        <span
          className="badge position-absolute top-0 end-0 m-2"
          style={{ backgroundColor: statusColor, color: '#fff' }}
        >
          {foto.estado === 'pendiente' || foto.estado === 'en_proceso' ? (
            <span className="spinner-border spinner-border-sm me-1" style={{ width: 10, height: 10 }} />
          ) : null}
          {t[foto.estado] || foto.estado}
        </span>
      </div>

      {/* Toggle original/anotada */}
      {foto.imagen_anotada && (
        <div className="ai-foto-toggle">
          <button
            className={`btn btn-sm ${!showOriginal ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setShowOriginal(false)}
          >
            {t.annotatedImage}
          </button>
          <button
            className={`btn btn-sm ${showOriginal ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setShowOriginal(true)}
          >
            {t.originalImage}
          </button>
        </div>
      )}

      <div className="card-body p-2 d-flex flex-column">
        {/* Estado error con botón retry */}
        {foto.estado === 'error' && (
          <div className="alert alert-danger py-1 px-2 small mb-2">
            {foto.error_detalle || t.error}
            {onRetry && (
              <button className="btn btn-outline-danger btn-sm ms-2 py-0" onClick={onRetry}>
                <i className="bi bi-arrow-clockwise me-1" />
                {t.retry}
              </button>
            )}
          </div>
        )}

        {/* Detecciones */}
        {foto.estado === 'completada' && (
          <>
            {detectionCount === 0 ? (
              <p className="text-success small mb-1">{t.noDetections}</p>
            ) : (
              <div>
                <div className="d-flex align-items-center gap-2 mb-1">
                  <span className="small fw-bold">
                    {detectionCount} {t.detections}
                    {inferenceMs && (
                      <span className="text-muted fw-normal ms-2">
                        ({t.inferenceTime}: {Math.round(inferenceMs)}ms)
                      </span>
                    )}
                  </span>
                  {severidad && (
                    <span
                      className="badge ms-auto"
                      style={{ backgroundColor: severidad.color, color: '#fff', fontSize: '0.62rem' }}
                    >
                      {severidad.label[lang] || severidad.label.es}
                    </span>
                  )}
                </div>
                <ul className="list-unstyled mb-0 small">
                  {detections.map((det, i) => {
                    const sev = getSeverity(det.class_name);
                    return (
                      <li key={i} className="d-flex align-items-center gap-1 justify-content-between">
                        <span className="me-auto">{classLabel(det.class_name, lang)}</span>
                        {sev && (
                          <span
                            className="badge"
                            style={{ backgroundColor: sev.color, color: '#fff', fontSize: '0.58rem', opacity: 0.9 }}
                          >
                            {sev.label[lang] || sev.label.es}
                          </span>
                        )}
                        <span className="text-muted" style={{ minWidth: '3.2rem', textAlign: 'right' }}>
                          {(det.max_confidence * 100).toFixed(1)}%
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}

        {/* Botón eliminar — siempre al fondo */}
        {onDelete && (
          <div className="mt-auto pt-2 border-top d-flex justify-content-end">
            <button
              className="btn btn-outline-danger btn-sm py-0 px-2"
              style={{ fontSize: '0.75rem' }}
              onClick={() => onDelete(foto.id)}
            >
              <i className="bi bi-trash me-1" />
              {t.deletePhoto}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
