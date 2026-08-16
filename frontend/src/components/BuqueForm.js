import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import { useNavigate, useParams } from 'react-router-dom';
import { API_BASE } from '../config';
import './FormBuques.css';
import api from '../services/api';
import useToasts, { DEFAULT_TOAST_TTL } from './ui/useToasts';
import Toaster from './ui/Toaster';
import PreviewModal from './PreviewModal';
// Añadimos un hook simple para conocer rol actual

/** Tipos sugeridos para documentos del buque (actualizado por el usuario) */
const DOC_TYPES = [
  { value: 'Planos contraactuales varios', label: 'Planos contraactuales varios' },
  { value: 'Especificación técnica', label: 'Especificación técnica' },
  { value: 'Hoja técnica', label: 'Hoja técnica' },
  { value: 'Carta de consumibes', label: 'Carta de consumibes' },
  { value: 'Carta de lubricantes', label: 'Carta de lubricantes' },
  { value: 'Plan de uso y mantenimiento', label: 'Plan de uso y mantenimiento' },
  { value: 'Documentación de grado de esencialidad de equipos', label: 'Documentación de grado de esencialidad de equipos' },
];

const DAY_KEYS = ['L','M','X','J','V','S','D'];

// Removed inline EyeIcon & TrashIcon definitions in favor of unified <Icon /> component

const AutoResizeTextarea = ({ value, onChange, ...props }) => {
  const textareaRef = useRef(null);

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto"; // Resetea la altura
      textarea.style.height = `${textarea.scrollHeight}px`; // Ajusta según el contenido
    }
  };

  useEffect(() => {
    adjustHeight(); // Ajusta la altura al montar el componente
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => {
        onChange(e);
        adjustHeight(); // Ajusta la altura al cambiar el contenido
      }}
      {...props}
    />
  );
};

// Funciones utilitarias para preview de documentos
const getExt = (name = '') => {
  try {
    const lastDot = name.lastIndexOf('.');
    return lastDot >= 0 ? name.slice(lastDot).toLowerCase() : '';
  } catch { return ''; }
};

const getExtFromNameOrUrl = (name, url) => {
  const a = getExt(name);
  if (a) return a;
  try {
    const u = new URL(url);
    return getExt(u.pathname);
  } catch { return ''; }
};

// ¿Se puede previsualizar in-browser?
const canPreview = (ext) => {
  const e = String(ext || '').toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf'].includes(e);
};

const BuqueForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const { pushToast } = useToasts();
  const [session, setSession] = useState(null);
  const [viewOnly, setViewOnly] = useState(false); // true cuando rol=user

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/auth/me');
        setSession(data);
        if (data?.role === 'user') setViewOnly(true);
      } catch {
        setSession(null);
      }
    })();
  }, []);

  // === BUQUEFORM_DIRTY_AND_LEAVE_MODAL_STATE (ADD) ===
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  // Track de cambios sin guardar
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(null);

  // Modal para confirmar salida sin guardar
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [pendingLeaveAction, setPendingLeaveAction] = useState(null); 
  // 'back' | 'cancel-create'

  // Función: construir un snapshot serializable del estado relevante (sin File binarios)
  const buildSnapshot = ({
    form, ficha, rondasCfg, gruposConstructivos, archivos, archivosExistentes, archivosEliminados, misiones
  }) => {
    return {
      form: { ...form, imagen: !!form?.imagen || null }, // solo marcamos si hay imagen nueva
      ficha: { ...ficha },
      rondasCfg: { ...rondasCfg },
      gruposConstructivos: [...(gruposConstructivos || [])],
      archivos: (archivos || []).map(a => ({ name: a.file?.name, size: a.file?.size, type: a.type || 'Otro' })),
      archivosExistentes: (archivosExistentes || []).map(a => ({ id: a.id, type: a.type || 'Otro' })),
      archivosEliminados: [...(archivosEliminados || [])],
      misiones: (misiones || []).map(m => ({ nombre: m.nombre || '', descripcion: m.descripcion || '' })),
    };
  };

  // Efecto: warning al cerrar pestaña/navegar duro si hay cambios
  useEffect(() => {
    const handler = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Helpers para abrir/cerrar el modal de salida
  const requestLeave = (kind) => {
    if (isDirty) {
      setPendingLeaveAction(kind);
      setShowLeaveConfirm(true);
    } else {
      if (kind === 'back') navigate(-1);
      if (kind === 'cancel-create') navigate('/buques');
    }
  };

  const confirmLeave = () => {
    setShowLeaveConfirm(false);
    if (pendingLeaveAction === 'back') navigate(-1);
    if (pendingLeaveAction === 'cancel-create') navigate('/buques');
    setPendingLeaveAction(null);
  };

  const cancelLeave = () => {
    setShowLeaveConfirm(false);
    setPendingLeaveAction(null);
  };


  // ---------- Datos generales ----------
  const [form, setForm] = useState({
    nombre: '',
    tipo: '',
    etapa: 'Activo',
    autonomia_horas: '',
    vida_diseno_anios: '',
    horas_navegacion_anio: '',
    descripcion: '',
    imagen: null, // File | null
  });

  // ---------- NUEVO: Ficha técnica (solo UI por ahora) ----------
  const [ficha, setFicha] = useState({
    vel_maxima_nudos: '',
    autonomia_dias: '',
    alcance_nm_a_12kn: '',
    eslora_total_m: '',
    manga_moldeada_m: '',
    puntal_m: '',
    calado_diseno_m: '',
    desplazamiento_ton: '',
    combustible_diario_m3: '',
    combustible_diesel_m3: '',
    combustible_helicoptero_m3: '',
    gasolina_botes_m3: '',
    agua_potable_m3: '',
    aceite_lubricante_m3: '',
    aceite_hidraulico_m3: '',
  });
  const setF = (k) => (e) => setFicha((p) => ({ ...p, [k]: e.target.value }));

  // ---------- Config de rondas ----------
  const [rondasCfg, setRondasCfg] = useState({
    intervalo: 1,
    unidad: 'hora',         // 'minuto' | 'hora' | 'dia'
    max_duracion_min: 15,
    ventana_inicio: '',
    ventana_fin: '',
    dias_activos: ['L','M','X','J','V'],
  });

  // ---------- Grupos constructivos (solo superuser/admin) ----------
  const [gruposConstructivos, setGruposConstructivos] = useState([
    { id: 1, ref: '100', label: 'Estructura del Casco', activo: false },
    { id: 2, ref: '200', label: 'Planta Propulsora', activo: true },
    { id: 3, ref: '300', label: 'Planta Eléctrica', activo: true },
    { id: 4, ref: '400', label: 'Sistemas de Comando y Control', activo: false },
    { id: 5, ref: '500', label: 'Sistemas Auxiliares', activo: true },
    { id: 6, ref: '600', label: 'Equipamiento y Mobiliario', activo: false },
    { id: 7, ref: '700', label: 'Armamento', activo: false },
  ]);

  // Cálculo de rondas por día / semana según la config actual
  const roundsInfo = useMemo(() => {
    const { intervalo, unidad, ventana_inicio, ventana_fin, dias_activos } = rondasCfg;

    const parseHM = (s) => {
      if (!s || typeof s !== 'string' || !s.includes(':')) return null;
      const [h, m] = s.split(':').map(Number);
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
      return h * 60 + m;                   // minutos desde 00:00
    };

    const startM = parseHM(ventana_inicio);
    const endM   = parseHM(ventana_fin);
    const k      = Math.max(1, Number(intervalo || 1));
    const days   = new Set(Array.isArray(dias_activos) ? dias_activos : []).size;

    // longitud de la ventana en minutos (soporta cruce de medianoche y 24h)
    let windowMin = null;
    if (startM != null && endM != null) {
      if (endM === startM) {
        windowMin = 24 * 60;                                     // 24h
      } else if (endM > startM) {
        windowMin = endM - startM;                               // mismo día
      } else {
        windowMin = (24 * 60 - startM) + endM;                   // cruza medianoche
      }
    }

    // tamaño del paso (solo para minuto/hora)
    const stepMin =
      unidad === 'minuto' ? k :
      unidad === 'hora'   ? k * 60 :
      null;

    let perDay  = null;   // rondas por día
    let weekly  = null;   // rondas por semana aprox
    let windowText = (startM != null && endM != null)
      ? `${ventana_inicio || '00:00'}–${ventana_fin || '00:00'}`
      : '';

    if (stepMin && windowMin != null) {
      perDay = Math.floor(windowMin / stepMin);                  // arranques por día
      weekly = perDay * days;
    } else if (unidad === 'dia') {
      // “cada k días” ≈ días_activos/k por semana
      weekly = days ? Math.floor(days / k) : 0;
    }

    return { perDay, weekly, windowText };
  }, [rondasCfg]);



  // ---------- Archivos ----------
  // nuevos (no subidos aún)
  const [archivos, setArchivos] = useState([]); // [{file:File, type:string, addedAt:Date}]
  // existentes (ya en servidor)
  const [archivosExistentes, setArchivosExistentes] = useState([]); // [{id,name,url,size,uploaded_at,type}]
  const [archivosEliminados, setArchivosEliminados] = useState([]); // [id]

  // ---------- Imagen hero ----------
  const [imgApi, setImgApi] = useState('');
  const [preview, setPreview] = useState('');
  const fileRef = useRef(null);

  const heroUrl = useMemo(() => {
    const fallback = `${process.env.PUBLIC_URL || ''}/default_image.PNG`;
    return (preview || imgApi || fallback);
  }, [preview, imgApi]);



  // ===== Misiones (UI) =====
  const [misiones, setMisiones] = useState([]); // [{id, nombre, descripcion}]
  const [showConfirm, setShowConfirm] = useState(false);
  const [missionToDelete, setMissionToDelete] = useState(null);

  // ===== Preview Modal para documentos =====
  const [docPreview, setDocPreview] = useState({ open: false, url: '', name: '', isPdf: false });

  // Estilos simples para el modal (sin depender de Bootstrap Modal)
  const confirmOverlayStyle = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999
  };
  const confirmModalStyle = {
    background: 'var(--bs-body-bg, #fff)',
    color: 'var(--bs-body-color, #000)',
    width: 'min(520px, 92vw)',
    borderRadius: '16px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
    padding: '20px'
  };



  // Helpers
  const formatBytes = (b) => {
    if (!b && b !== 0) return '';
    const u = ['B','KB','MB','GB','TB'];
    let i = 0, n = +b;
    while (n >= 1024 && i < u.length-1) { n /= 1024; i++; }
    return `${n.toFixed(n < 10 && i ? 1 : 0)} ${u[i]}`;
  };
  const formatDate = (iso) => {
    try {
      const d = iso ? new Date(iso) : new Date();
      return d.toLocaleDateString();
    } catch { return ''; }
  };

  // === Funciones para preview de documentos ===
  const openDocPreview = (doc) => {
    if (!doc) return;
    // Para archivos nuevos (pendientes de subir)
    if (doc.file) {
      const ext = getExt(doc.file.name);
      if (!canPreview(ext)) return;
      const objectUrl = URL.createObjectURL(doc.file);
      setDocPreview({ open: true, url: objectUrl, name: doc.file.name, isPdf: ext === '.pdf' });
      return;
    }
    // Para archivos existentes (ya subidos)
    if (doc.url && doc.name) {
      const ext = getExtFromNameOrUrl(doc.name, doc.url);
      if (!canPreview(ext)) return;
      openDocPreviewUrl(doc.name, doc.url);
    }
  };

  const openDocPreviewUrl = async (name, url) => {
    try {
      const res = await api.get(url, {
        withCredentials: true,
        responseType: 'blob',
      });
      const blob = res.data;
      const objectUrl = URL.createObjectURL(blob);
      const ext = getExtFromNameOrUrl(name, url);
      setDocPreview({ open: true, url: objectUrl, name, isPdf: ext === '.pdf' });
    } catch (e) {
      // fallback: abrir en nueva pestaña
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const closeDocPreview = () => {
    if (docPreview.url?.startsWith('blob:')) URL.revokeObjectURL(docPreview.url);
    setDocPreview({ open: false, url: '', name: '', isPdf: false });
  };

  // === BUQUEFORM_LOAD_AND_DIRTY_EFFECTS (REPLACE) ===
  useEffect(() => {
    let abort = false;

    const load = async () => {
      if (!isEdit) {
        setLoading(false);
        // Snapshot inicial vacío para modo crear
        const snap = buildSnapshot({
          form, ficha, rondasCfg, gruposConstructivos, archivos, archivosExistentes, archivosEliminados, misiones
        });
        setLastSavedSnapshot(snap);
        setIsDirty(false);
        return;
      }
      try {
        const { data } = await api.get(`${API_BASE}/api/buque/${id}/`);
        if (abort) return;

        setMisiones(Array.isArray(data?.misiones) ? data.misiones : []);

        setForm(prev => ({
          ...prev,
          nombre: data?.nombre || '',
          tipo: data?.tipo || '',
          etapa: data?.etapa || 'Activo',
          autonomia_horas: data?.autonomia_horas ?? '',
          vida_diseno_anios: data?.vida_diseno_anios ?? '',
          horas_navegacion_anio: data?.horas_navegacion_anio ?? '',
          descripcion: data?.descripcion || '',
          imagen: null,
        }));
        setImgApi(data?.imagen || '');

        if (data?.rondas_config) {
          setRondasCfg(prev => ({
            ...prev,
            intervalo: data.rondas_config.intervalo ?? prev.intervalo,
            unidad: data.rondas_config.unidad ?? prev.unidad,
            max_duracion_min: data.rondas_config.max_duracion_min ?? prev.max_duracion_min,
            ventana_inicio: data.rondas_config.ventana_inicio ?? '',
            ventana_fin: data.rondas_config.ventana_fin ?? '',
            dias_activos:
              Array.isArray(data.rondas_config.dias_activos) && data.rondas_config.dias_activos.length
                ? data.rondas_config.dias_activos
                : prev.dias_activos,
          }));
        }

        if (Array.isArray(data?.documentos)) {
          setArchivosExistentes(data.documentos);
        }

        if (data?.ficha_tecnica) {
          setFicha({
            vel_maxima_nudos: data.ficha_tecnica.vel_maxima_nudos ?? '',
            autonomia_dias: data.ficha_tecnica.autonomia_dias ?? '',
            alcance_nm_a_12kn: data.ficha_tecnica.alcance_nm_a_12kn ?? '',
            eslora_total_m: data.ficha_tecnica.eslora_total_m ?? '',
            manga_moldeada_m: data.ficha_tecnica.manga_moldeada_m ?? '',
            puntal_m: data.ficha_tecnica.puntal_m ?? '',
            calado_diseno_m: data.ficha_tecnica.calado_diseno_m ?? '',
            desplazamiento_ton: data.ficha_tecnica.desplazamiento_ton ?? '',
            combustible_diario_m3: data.ficha_tecnica.combustible_diario_m3 ?? '',
            combustible_diesel_m3: data.ficha_tecnica.combustible_diesel_m3 ?? '',
            combustible_helicoptero_m3: data.ficha_tecnica.combustible_helicoptero_m3 ?? '',
            gasolina_botes_m3: data.ficha_tecnica.gasolina_botes_m3 ?? '',
            agua_potable_m3: data.ficha_tecnica.agua_potable_m3 ?? '',
            aceite_lubricante_m3: data.ficha_tecnica.aceite_lubricante_m3 ?? '',
            aceite_hidraulico_m3: data.ficha_tecnica.aceite_hidraulico_m3 ?? '',
          });
        }

        // Cargar grupos constructivos si existen en la respuesta (y no están vacíos)
        if (Array.isArray(data?.grupos_constructivos) && data.grupos_constructivos.length > 0) {
          setGruposConstructivos(data.grupos_constructivos);
        }
        // Si no hay grupos constructivos guardados, mantener los valores por defecto
      } catch (err) {
        console.error('❌ Error cargando buque:', err);
        pushToast('No se pudo cargar el buque.', 'error', 5000);
      } finally {
        if (!abort) {
          setLoading(false);
          // Construye snapshot tras terminar de poblar estados
          setTimeout(() => {
            const snap = buildSnapshot({
              form, ficha, rondasCfg, gruposConstructivos, archivos, archivosExistentes, archivosEliminados, misiones
            });
            setLastSavedSnapshot(snap);
            setIsDirty(false);
          }, 0);
        }
      }
    };

    load();
    return () => { abort = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit]);

  // Efecto: recalcular si está “sucio” cuando cambie algo relevante
  useEffect(() => {
    if (loading) return;
    const snap = buildSnapshot({
      form, ficha, rondasCfg, gruposConstructivos, archivos, archivosExistentes, archivosEliminados, misiones
    });
    if (lastSavedSnapshot) {
      setIsDirty(JSON.stringify(snap) !== JSON.stringify(lastSavedSnapshot));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, ficha, rondasCfg, gruposConstructivos, archivos, archivosExistentes, archivosEliminados, misiones, loading]);



  // Imagen local preview
  const onFileHero = (file) => {
    setForm(prev => ({ ...prev, imagen: file || null }));
    if (file) setPreview(URL.createObjectURL(file));
    else setPreview('');
  };

  // ===== Handlers de misiones =====
  const addMision = () => {
    setMisiones(prev => [...prev, { id: Date.now(), nombre: '', descripcion: '' }]);
  };

  const updateMision = (id, field, value) => {
    setMisiones((prev) =>
      prev.map((mision) =>
        mision.id === id ? { ...mision, [field]: value } : mision
      )
    );
  };

  const askDeleteMision = (id) => {
    setMissionToDelete(id);
    setShowConfirm(true);
  };

  const confirmDeleteMision = () => {
    setMisiones(prev => prev.filter(m => m.id !== missionToDelete));
    setShowConfirm(false);
    setMissionToDelete(null);
  };

  const cancelDeleteMision = () => {
    setShowConfirm(false);
    setMissionToDelete(null);
  };



  // chips de días
  const toggleDia = (dia) => {
    setRondasCfg(prev => {
      const active = new Set(prev.dias_activos);
      if (active.has(dia)) active.delete(dia); else active.add(dia);
      return { ...prev, dias_activos: Array.from(active) };
    });
  };

  // drag & drop archivos
  const onDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) {
      const withMeta = files.map(f => ({ file: f, type: 'Otro', addedAt: new Date() }));
      setArchivos(prev => [...prev, ...withMeta]);
    }
  };
  const onPickFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) {
      const withMeta = files.map(f => ({ file: f, type: 'Otro', addedAt: new Date() }));
      setArchivos(prev => [...prev, ...withMeta]);
    }
  };
  const quitarNuevo = (idx) => {
    setArchivos(prev => prev.filter((_, i) => i !== idx));
  };
  const quitarExistente = (idDoc) => {
    setArchivosExistentes(prev => prev.filter(a => a.id !== idDoc));
    setArchivosEliminados(prev => [...prev, idDoc]);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    const formData = new FormData();
    formData.append('nombre', form.nombre);
    formData.append('tipo', form.tipo);
    formData.append('etapa', form.etapa);
    formData.append('autonomia_horas', form.autonomia_horas);
    formData.append('vida_diseno_anios', form.vida_diseno_anios);
    formData.append('horas_navegacion_anio', form.horas_navegacion_anio);
    formData.append('descripcion', form.descripcion);

    if (form.imagen) formData.append('imagen', form.imagen);

    // Ficha técnica
    Object.entries(ficha).forEach(([k, v]) => formData.append(k, v));

    // Config de rondas
    formData.append('rondas_config', JSON.stringify(rondasCfg));

    // Grupos constructivos (solo para superuser/admin)
    if (session?.role === 'superuser' || session?.role === 'admin') {
      formData.append('grupos_constructivos', JSON.stringify(gruposConstructivos));
    }

    // Archivos nuevos
    archivos.forEach((a) => {
      formData.append('docs_new', a.file);
      formData.append('docs_new_types', a.type || 'Otro');
    });

    // Eliminar existentes marcados
    formData.append('docs_remove_ids', JSON.stringify(archivosEliminados));

    // Contexto operacional (ajusta si lo usas)
    formData.append('contexto_operacional', JSON.stringify({}));

    try {
      const url = isEdit
        ? `${API_BASE}/api/buque/${id}/`
        : `${API_BASE}/api/buques/`;

      const method = isEdit ? 'put' : 'post';

      formData.append('misiones', JSON.stringify(misiones));

      await api[method](url, formData);

      // ✅ Toast de éxito y NO navegar
      pushToast(
        isEdit ? 'Buque actualizado correctamente.' : 'Buque creado correctamente.',
        'success',
        DEFAULT_TOAST_TTL
      );

      // Actualizar snapshot de “guardado” para que deje de marcarse como sucio
      const snap = buildSnapshot({
        form, ficha, rondasCfg, gruposConstructivos, archivos, archivosExistentes, archivosEliminados, misiones
      });
      setLastSavedSnapshot(snap);
      setIsDirty(false);

      // Si quieres limpiar archivos nuevos tras guardar:
      // setArchivos([]);
      // setArchivosEliminados([]);

    } catch (err) {
      console.error('Error al guardar el buque:', err);
      pushToast('Error al guardar el buque. Revisa la conexión o los datos.', 'error', 5000);
    } finally {
      setSaving(false);
    }
  };




  if (loading) {
    return <div className="container mt-4"><p>Cargando…</p></div>;
  }

  return (
    <div className="container mt-4">
      <Toaster />
      {/* Modal de confirmación para salir sin guardar */}
      {showLeaveConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div style={{
            background: 'var(--bs-body-bg, #fff)',
            color: 'var(--bs-body-color, #000)',
            width: 'min(520px, 92vw)',
            borderRadius: '16px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
            padding: '20px'
          }}>
            <h6 className="mb-2">Salir sin guardar</h6>
            <p className="text-muted mb-4">
              Tienes cambios sin guardar. ¿Seguro que deseas salir y perder estos cambios?
            </p>
            <div className="d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-outline-secondary" onClick={cancelLeave}>
                Continuar editando
              </button>
              <button type="button" className="btn btn-danger" onClick={confirmLeave}>
                Salir sin guardar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="d-flex justify-content-between align-items-center mb-3">
        <div><h4 className="mb-0">{isEdit ? 'Editar Buque / Proyecto' : 'Nuevo Buque / Proyecto'}</h4></div>

        {/* En modo EDITAR: mostrar botón Volver (esquina sup. derecha) */}
        {isEdit && (
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => requestLeave('back')}
          >
            Volver
          </button>
        )}
        {/* En modo CREAR: NO mostrar Volver aquí */}
      </div>


      <div className="buque-form-wrapper p-4 shadow rounded">
        <form onSubmit={onSubmit}>
          <div className="row g-4 align-items-start">
            {/* ============== Columna izquierda ============== */}
            <div className="col-12 col-lg-7">

              {/* Datos generales */}
              <div className="section-card mb-4">
                <div className="section-header">
                  <h6 className="mb-0">Datos generales</h6>
                </div>
                <div className="section-body">
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label">Nombre</label>
                      <input
                        className="form-control"
                        value={form.nombre}
                        onChange={(e) => setForm(prev => ({ ...prev, nombre: e.target.value }))}
                        required
                        disabled={viewOnly}
                      />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label">Tipo</label>
                      <input
                        className="form-control"
                        placeholder="OPV, Bote, Investigación…"
                        value={form.tipo}
                        onChange={(e) => setForm(prev => ({ ...prev, tipo: e.target.value }))}
                        disabled={viewOnly}
                      />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label">Etapa</label>
                      <select
                        className="form-select"
                        value={form.etapa}
                        onChange={(e) => setForm(prev => ({ ...prev, etapa: e.target.value }))}
                        disabled={viewOnly}
                      >
                        <option value="Activo">Activo</option>
                        <option value="Fase de operación">Fase de operación</option>
                        <option value="Construcción">Construcción</option>
                        <option value="Diseño">Diseño</option>
                        <option value="Mantenimiento">Mantenimiento</option>
                        <option value="Baja">Baja</option>
                      </select>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Autonomía (horas)</label>
                      <input
                        type="number" min="0" className="form-control"
                        value={form.autonomia_horas}
                        onChange={(e) => setForm(prev => ({ ...prev, autonomia_horas: e.target.value }))}
                        disabled={viewOnly}
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Vida de diseño (años)</label>
                      <input
                        type="number" min="0" className="form-control"
                        value={form.vida_diseno_anios}
                        onChange={(e) => setForm(prev => ({ ...prev, vida_diseno_anios: e.target.value }))}
                        disabled={viewOnly}
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Horas de navegación/año</label>
                      <input
                        type="number" min="0" className="form-control"
                        value={form.horas_navegacion_anio}
                        onChange={(e) => setForm(prev => ({ ...prev, horas_navegacion_anio: e.target.value }))}
                        disabled={viewOnly}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* ===== NUEVO: Ficha técnica ===== */}
              <div className="section-card mt-4">
                <div className="section-header">
                  <h6 className="mb-0">Ficha técnica</h6>
                </div>
                <div className="section-body">
                  {/* Desempeño */}
                  <div className="mb-3">
                    <div className="small text-uppercase text-muted fw-semibold mb-2">Desempeño</div>
                    <div className="row g-3">
                      <div className="col-md-4">
                        <label className="form-label">Velocidad máxima (nudos)</label>
                        <input type="number" min="0" step="any" className="form-control" value={ficha.vel_maxima_nudos} onChange={setF('vel_maxima_nudos')} disabled={viewOnly} />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Autonomía (días)</label>
                        <input type="number" min="0" step="any" className="form-control" value={ficha.autonomia_dias} onChange={setF('autonomia_dias')} disabled={viewOnly} />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Alcance (nm @ 12 nudos)</label>
                        <input type="number" min="0" step="any" className="form-control" value={ficha.alcance_nm_a_12kn} onChange={setF('alcance_nm_a_12kn')} disabled={viewOnly} />
                      </div>
                    </div>
                  </div>

                  {/* Dimensiones */}
                  <div className="mb-3">
                    <div className="small text-uppercase text-muted fw-semibold mb-2">Dimensiones</div>
                    <div className="row g-3">
                      <div className="col-md-4">
                        <label className="form-label">Eslora total (m)</label>
                        <input type="number" min="0" step="any" className="form-control" value={ficha.eslora_total_m} onChange={setF('eslora_total_m')} disabled={viewOnly} />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Manga moldeada (m)</label>
                        <input type="number" min="0" step="any" className="form-control" value={ficha.manga_moldeada_m} onChange={setF('manga_moldeada_m')} disabled={viewOnly} />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Puntal (m)</label>
                        <input type="number" min="0" step="any" className="form-control" value={ficha.puntal_m} onChange={setF('puntal_m')} disabled={viewOnly} />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Calado diseño (m)</label>
                        <input type="number" min="0" step="any" className="form-control" value={ficha.calado_diseno_m} onChange={setF('calado_diseno_m')} disabled={viewOnly} />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Desplazamiento (ton)</label>
                        <input type="number" min="0" step="any" className="form-control" value={ficha.desplazamiento_ton} onChange={setF('desplazamiento_ton')} disabled={viewOnly} />
                      </div>
                    </div>
                  </div>

                  {/* Capacidades */}
                  <div>
                    <div className="small text-uppercase text-muted fw-semibold mb-2">Capacidades</div>
                    <div className="row g-3">
                      <div className="col-md-6">
                        <label className="form-label">Combustible (Diario) — m³</label>
                        <input type="number" min="0" step="any" className="form-control" value={ficha.combustible_diario_m3} onChange={setF('combustible_diario_m3')} disabled={viewOnly} />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Combustible (Diésel) — m³</label>
                        <input type="number" min="0" step="any" className="form-control" value={ficha.combustible_diesel_m3} onChange={setF('combustible_diesel_m3')} disabled={viewOnly} />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Combustible Helicóptero — m³</label>
                        <input type="number" min="0" step="any" className="form-control" value={ficha.combustible_helicoptero_m3} onChange={setF('combustible_helicoptero_m3')} disabled={viewOnly} />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Gasolina para botes — m³</label>
                        <input type="number" min="0" step="any" className="form-control" value={ficha.gasolina_botes_m3} onChange={setF('gasolina_botes_m3')} disabled={viewOnly} />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Agua Potable — m³</label>
                        <input type="number" min="0" step="any" className="form-control" value={ficha.agua_potable_m3} onChange={setF('agua_potable_m3')} disabled={viewOnly} />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Aceite Lubricante — m³</label>
                        <input type="number" min="0" step="any" className="form-control" value={ficha.aceite_lubricante_m3} onChange={setF('aceite_lubricante_m3')} disabled={viewOnly} />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Aceite Hidráulico — m³</label>
                        <input type="number" min="0" step="any" className="form-control" value={ficha.aceite_hidraulico_m3} onChange={setF('aceite_hidraulico_m3')} disabled={viewOnly} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>


              {/* Configuración de rondas */}
              <div className="section-card mb-4">
                <div className="section-header d-flex justify-content-between align-items-center">
                  <h6 className="mb-0">Configuración de rondas</h6>
                    <div className="text-end">
                        {/* 1ª línea */}
                        <div className="text-muted small">
                            cada <b>{rondasCfg.intervalo}</b> {rondasCfg.unidad}{rondasCfg.intervalo > 1 ? 's' : ''}
                            · máx <b>{rondasCfg.max_duracion_min}</b> min
                            {roundsInfo.windowText && <> · ventana <b>{roundsInfo.windowText}</b></>}
                        </div>

                        {/* 2ª línea: 12 rondas/día · ≈ 84 / semana (dinámico) */}
                        {((rondasCfg.unidad !== 'dia' && roundsInfo.perDay !== null) || roundsInfo.weekly !== null) && (
                            <div className="text-muted small">
                            {rondasCfg.unidad !== 'dia' && roundsInfo.perDay !== null && <><b>{roundsInfo.perDay}</b> rondas/día</>}
                            {rondasCfg.unidad !== 'dia' && roundsInfo.perDay !== null && roundsInfo.weekly !== null && ' · '}
                            {roundsInfo.weekly !== null && <>≈ <b>{roundsInfo.weekly}</b> / semana</>}
                            </div>
                        )}
                    </div>


                </div>
                <div className="section-body">
                  <div className="row g-3 align-items-end">
                    <div className="col-6 col-md-4">
                      <label className="form-label">Intervalo</label>
                      <input
                        type="number" min="1" className="form-control"
                        value={rondasCfg.intervalo}
                        onChange={(e) => setRondasCfg(prev => ({ ...prev, intervalo: Math.max(1, Number(e.target.value || 1)) }))}
                        disabled={viewOnly}
                      />
                    </div>
                    <div className="col-6 col-md-8">
                      <label className="form-label">Unidad</label>
                      <div className="segmented">
                        {['minuto','hora','dia'].map(u => (
                          <button
                            key={u}
                            type="button"
                            className={`segmented-item ${rondasCfg.unidad === u ? 'active' : ''}`}
                            onClick={() => !viewOnly && setRondasCfg(prev => ({ ...prev, unidad: u }))}
                            disabled={viewOnly}
                          >
                            {u.charAt(0).toUpperCase() + u.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="col-md-4">
                      <label className="form-label">Duración máx (min)</label>
                      <input
                        type="number" min="1" className="form-control"
                        value={rondasCfg.max_duracion_min}
                        onChange={(e) => setRondasCfg(prev => ({ ...prev, max_duracion_min: Math.max(1, Number(e.target.value || 1)) }))}
                        disabled={viewOnly}
                      />
                    </div>

                    <div className="col-md-4">
                      <label className="form-label">Desde (HH:MM)</label>
                      <input
                        type="time" className="form-control"
                        value={rondasCfg.ventana_inicio}
                        onChange={(e) => setRondasCfg(prev => ({ ...prev, ventana_inicio: e.target.value }))}
                        disabled={viewOnly}
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Hasta (HH:MM)</label>
                      <input
                        type="time" className="form-control"
                        value={rondasCfg.ventana_fin}
                        onChange={(e) => setRondasCfg(prev => ({ ...prev, ventana_fin: e.target.value }))}
                        disabled={viewOnly}
                      />
                    </div>

                    <div className="col-12">
                      <label className="form-label d-block">Días activos</label>
                      <div className="days-wrap">
                        {DAY_KEYS.map(d => (
                          <button
                            key={d}
                            type="button"
                            className={`day-chip ${rondasCfg.dias_activos.includes(d) ? 'active' : ''}`}
                            onClick={() => !viewOnly && toggleDia(d)}
                            disabled={viewOnly}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Grupos constructivos (solo superuser/admin) */}
              {(session?.role === 'superuser' || session?.role === 'admin') && (
                <div className="section-card mb-4">
                  <div className="section-header">
                    <h6 className="mb-0">Grupos constructivos</h6>
                    <small className="text-muted">Configura qué grupos SWBS se mostrarán en la aplicación</small>
                  </div>
                  <div className="section-body">

                    <div className="row g-2">
                      {gruposConstructivos.map((grupo, index) => (
                        <div className="col-md-4 col-sm-6" key={grupo.id}>
                          <div className="d-flex align-items-center gap-2 p-2 border rounded">
                            <div className="form-check mb-0">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                id={`grupo-${grupo.id}`}
                                checked={grupo.activo}
                                onChange={(e) => {
                                  const newGrupos = [...gruposConstructivos];
                                  newGrupos[index] = { ...grupo, activo: e.target.checked };
                                  setGruposConstructivos(newGrupos);
                                }}
                                disabled={viewOnly}
                              />
                            </div>
                            <div className="flex-grow-1 min-w-0">
                              <div className="fw-semibold text-truncate" title={`${grupo.ref} - ${grupo.label}`}>
                                {grupo.ref} - {grupo.label}
                              </div>
                              <small className="text-muted">Grupo {grupo.ref}</small>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3">
                      <small className="text-muted">
                        <Icon name="info" size={14} className="me-1" />
                        Solo los grupos marcados aparecerán como botones en el Dashboard y en la gestión SWBS.
                      </small>
                    </div>
                  </div>
                </div>
              )}

              {/* Archivos del proyecto (siempre visible; modo lectura restringe acciones) */}
              <div className="section-card">
                <div className="section-header">
                  <h6 className="mb-0">Archivos del proyecto</h6>
                </div>
                <div className="section-body">
                  {viewOnly ? (
                    archivosExistentes.length === 0 ? (
                      <p className="text-muted mb-0">No hay documentos.</p>
                    ) : (
                      <div className="doc-table mt-2">
                        <div className="doc-head">
                          <div>Nombre</div>
                          <div>Tipo</div>
                          <div className="text-end">Acciones</div>
                        </div>
                        {archivosExistentes.map(a => (
                          <div className="doc-row" key={`ex-ro-${a.id}`}>
                            <div className="doc-name">
                              <div className="title">{a.name || a.url?.split('/').pop()}</div>
                              <div className="meta">{formatBytes(a.size)} · {formatDate(a.uploaded_at)}</div>
                            </div>
                            <div className="doc-type">
                              <span className={`doc-badge ${(`badge-${(a.type||'Otro').toLowerCase()}`).replace(/[^a-z-]/g,'')}`}>
                                {a.type || 'Otro'}
                              </span>
                            </div>
                            <div className="doc-actions">
                              <button 
                                type="button" 
                                className="icon-btn" 
                                title="Ver documento" 
                                onClick={() => openDocPreview(a)}
                              >
                                <Icon name="eye" size={18} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    <>
                      <div
                        className="dropzone"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={onDrop}
                      >
                        <div className="dz-icon">
                          <Icon name="plus" size={22} />
                        </div>
                        <div className='d-flex align-items-center'>
                          <div className="dz-title">Arrastra archivos aquí o </div>

                          <label className="btn btn-outline-primary dz-btn">
                            Seleccionar archivos
                            <input
                              type="file"
                              multiple
                              className="d-none"
                              onChange={onPickFiles}
                            />
                          </label>
                        </div>
                      </div>

                      {(archivosExistentes.length > 0 || archivos.length > 0) && (
                        <div className="doc-table mt-3">
                          <div className="doc-head">
                            <div>Nombre</div>
                            <div>Tipo</div>
                            <div className="text-end">Acciones</div>
                          </div>
                          {archivosExistentes.map(a => (
                            <div className="doc-row" key={`ex-${a.id}`}>
                              <div className="doc-name">
                                <div className="title">{a.name || a.url?.split('/').pop()}</div>
                                <div className="meta">{formatBytes(a.size)} · {formatDate(a.uploaded_at)}</div>
                              </div>
                              <div className="doc-type">
                                <span className={`doc-badge ${(`badge-${(a.type||'Otro').toLowerCase()}`).replace(/[^a-z-]/g,'')}`}>
                                  {a.type || 'Otro'}
                                </span>
                                <select
                                  className="doc-type-select"
                                  value={a.type || 'Otro'}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setArchivosExistentes(prev => prev.map(x => x.id === a.id ? {...x, type: v} : x));
                                  }}
                                >
                                  {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                              </div>
                              <div className="doc-actions">
                                <button 
                                  type="button" 
                                  className="icon-btn" 
                                  title="Ver documento" 
                                  onClick={() => openDocPreview(a)}
                                >
                                  <Icon name="eye" size={18} />
                                </button>
                                <button type="button" className="icon-btn danger" title="Eliminar" onClick={() => quitarExistente(a.id)}>
                                  <Icon name="delete" size={18} />
                                </button>
                              </div>
                            </div>
                          ))}
                          {archivos.map((a, idx) => (
                            <div className="doc-row" key={`new-${idx}`}>
                              <div className="doc-name">
                                <div className="title">{a.file.name}</div>
                                <div className="meta">{formatBytes(a.file.size)} · {formatDate(a.addedAt?.toISOString())}</div>
                              </div>
                              <div className="doc-type">
                                <span className={`doc-badge ${(`badge-${(a.type||'Otro').toLowerCase()}`).replace(/[^a-z-]/g,'')}`}>
                                  {a.type || 'Otro'}
                                </span>
                                <select
                                  className="doc-type-select"
                                  value={a.type}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setArchivos(prev => prev.map((x,i) => i===idx ? {...x, type:v} : x));
                                  }}
                                >
                                  {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                              </div>
                              <div className="doc-actions">
                                <button 
                                  type="button" 
                                  className="icon-btn" 
                                  title="Ver documento" 
                                  onClick={() => openDocPreview(a)}
                                >
                                  <Icon name="eye" size={18} />
                                </button>
                                <button type="button" className="icon-btn danger" title="Quitar" onClick={() => quitarNuevo(idx)}>
                                  <Icon name="delete" size={18} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

            </div>{/* <-- cierre col izquierda */}

            {/* ============== Columna derecha ============== */}
            <div className="col-12 col-lg-5">
              <div
                className="buque-form-hero rounded-3 mb-3"
                style={{
                  backgroundImage: `url("${heroUrl}")`,
                  minHeight: 260,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center'
                }}
              >
                {!viewOnly && (
                <button
                  type="button"
                  className="hero-action"
                  title="Actualizar imagen"
                  onClick={() => fileRef.current?.click()}
                >
                  <Icon name="camera" size={20} />
                  <span>Presione para actualizar imagen</span>
                </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="d-none"
                  onChange={(e) => onFileHero(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
                  disabled={viewOnly}
                />
              </div>

              <label className="form-label">Descripción</label>
              <textarea
                className="form-control"
                rows={6}
                value={form.descripcion}
                onChange={(e) => setForm(prev => ({ ...prev, descripcion: e.target.value }))}
                disabled={viewOnly}
              />

              
              {/* Sección Perfil Operacional */}
              <div className="section-card mt-4">
                <div className="section-header d-flex align-items-center justify-content-between">
                  <h6 className="mb-0">Perfil Operacional</h6>
                  {!viewOnly && (
                    <button type="button" className="btn btn-sm btn-primary" onClick={addMision}>
                      + Añadir misión
                    </button>
                  )}
                </div>

                <div className="section-body">
                  {misiones.length === 0 && (
                    <p className="text-muted mb-0">No hay misiones registradas. Use “Añadir misión”.</p>
                  )}

                  <div className="row g-3">
                    {misiones.map((m) => (
                      <div className="col-12" key={m.id}>
                        <div className="card shadow-sm">
                          <div className="card-body">
                            <div className="d-flex justify-content-between align-items-start mb-2">
                              <label className="form-label mb-0">Nombre de la misión</label>
                              {!viewOnly && (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-danger"
                                  title="Eliminar misión"
                                  onClick={() => askDeleteMision(m.id)}
                                >
                                  Eliminar
                                </button>
                              )}
                            </div>
                            <input
                              className="form-control mb-3"
                              placeholder="Ej. Patrullaje oceánico"
                              value={m.nombre}
                              onChange={(e) => updateMision(m.id, 'nombre', e.target.value)}
                              disabled={viewOnly}
                            />

                            <label className="form-label">Descripción</label>
                            <AutoResizeTextarea
                              className="form-control"
                              rows={3}
                              placeholder="Describe objetivos, alcance, restricciones, etc."
                              value={m.descripcion}
                              onChange={(e) => updateMision(m.id, 'descripcion', e.target.value)}
                              disabled={viewOnly}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Modal de confirmación de eliminación */}
              {showConfirm && (
                <div style={confirmOverlayStyle}>
                  <div style={confirmModalStyle}>
                    <h6 className="mb-2">Eliminar misión</h6>
                    <p className="text-muted mb-4">¿Estás seguro de eliminar esta misión? Esta acción no se puede deshacer.</p>
                    <div className="d-flex justify-content-end gap-2">
                      <button type="button" className="btn btn-outline-secondary" onClick={cancelDeleteMision}>
                        Cancelar
                      </button>
                      <button type="button" className="btn btn-danger" onClick={confirmDeleteMision}>
                        Sí, eliminar
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>

          {!viewOnly && (
            <div className="d-flex justify-content-end mt-4 gap-2">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
              {!isEdit && (
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => requestLeave('cancel-create')}
                  disabled={saving}
                >
                  Cancelar
                </button>
              )}
            </div>
          )}

        </form>

        {/* Modal de previsualización de documentos */}
        <PreviewModal
          open={docPreview.open}
          onClose={closeDocPreview}
          url={docPreview.url}
          name={docPreview.name}
          isPdf={docPreview.isPdf}
        />
      </div>
    </div>
    
  );
};

export default BuqueForm;
