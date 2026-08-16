import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { API_BASE } from '../config';
import api from '../services/api';
import Icon from './Icon';
import CameraCapture from './CameraCapture';
import ReactDOM from 'react-dom/client';
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';
import './RondaEquipo.css';
import './RondaEquipo-iOS.css';


const LANG_KEY = 'app_lang';
const tzLabel = 'America/Bogota';

// --- i18n ---
const i18n = {
  es: {
    loading: 'Cargando…',
    errorPrefix: 'Error',
    back: 'Volver',
    roundOf: 'Ronda',
    timezone: 'Zona horaria',
    now: 'Ahora',
    noParamsTitle: 'Este equipo no tiene parámetros seleccionados aún.',
    noParamsHelp: 'Configúralos en',
    manageEquip: 'Gestión de Equipos',
    dateOfReading: 'Fecha de toma',
    timeOfReading: 'Hora de toma',
    observations: 'Observaciones (opcional)',
    observationsPh: 'Notas de la ronda…',
    hourMeter: 'Horómetro (horas)',
    hourMeterPh: 'Horas de operación del equipo…',
    roundPhoto: 'Foto de la ronda',
    takePhoto: 'Tomar foto',
    photoTaken: 'Foto capturada',
    removePhoto: 'Quitar foto',
    startCamera: 'Iniciar cámara',
    activateCamera: 'Activar cámara para tomar foto',
    gallery: 'Galería',
    capture: 'Capturar',
    cancel: 'Cancelar',
    minShort: 'Min',
    maxShort: 'Max',
    saveReading: 'Guardar lectura',
    teamNotFound: 'Equipo no encontrado',
    paramsLoadError: 'No se pudieron cargar los parámetros del equipo',
    genericLoadError: 'Error cargando la ronda',
    noReadingsToSave: 'No hay lecturas para guardar.',
    missingReadings: 'Faltan lecturas por completar. Por favor, ingresa valores para todos los parámetros.',
    saveErrorPrefix: 'Error al guardar la ronda',
    equipmentLabel: 'Equipo',
    sepDot: '·',

    // NUEVO: barra de estado de ventana
    windowActive: 'Ventana activa.',
    windowClosed: 'Ventana inactiva.',
    timeLeftShort: 'Queda',
    opensInShort: 'Se habilita en',

    // rango
    outRangeTitle: 'Valor fuera de rango',
  outRangeMsg: 'El valor ingresado para "{name}" está fuera del rango normal ({min} - {max}). ¿Confirmas que es correcto?',
    confirm: 'Confirmar',
    cancel: 'Cancelar',

    // ronda ya hecha
    roundAlreadyDoneTitle: 'Ronda ya registrada',
    roundAlreadyDoneMsg: 'Este equipo ya tiene una ronda registrada en la ventana actual. No es posible ingresar una nueva lectura hasta la próxima ventana.',
    close: 'Cerrar',
  },
  en: {
    loading: 'Loading…',
    errorPrefix: 'Error',
    back: 'Back',
    roundOf: 'Round',
    timezone: 'Time zone',
    now: 'Now',
    noParamsTitle: 'This equipment has no selected parameters yet.',
    noParamsHelp: 'Configure them in',
    manageEquip: 'Equipment Management',
    dateOfReading: 'Reading date',
    timeOfReading: 'Reading time',
    observations: 'Observations (optional)',
    observationsPh: 'Round notes…',
    hourMeter: 'Hour meter (hours)',
    hourMeterPh: 'Equipment operation hours…',
    roundPhoto: 'Round photo',
    takePhoto: 'Take photo',
    photoTaken: 'Photo captured',
    removePhoto: 'Remove photo',
    startCamera: 'Start camera',
    activateCamera: 'Activate camera to take photo',
    gallery: 'Gallery',
    capture: 'Capture',
    cancel: 'Cancel',
    minShort: 'Min',
    maxShort: 'Max',
    saveReading: 'Save reading',
    teamNotFound: 'Equipment not found',
    paramsLoadError: 'Failed to load equipment parameters',
    genericLoadError: 'Error loading the round',
    noReadingsToSave: 'There are no readings to save.',
    missingReadings: 'Some readings are missing. Please enter values for all parameters.',
    saveErrorPrefix: 'Error saving the round',
    equipmentLabel: 'Equipment',
    sepDot: '·',

    // NEW
    windowActive: 'Window active.',
    windowClosed: 'Window inactive.',
    timeLeftShort: 'Left',
    opensInShort: 'Opens in',

    // range
    outRangeTitle: 'Value out of range',
  outRangeMsg: 'The value entered for "{name}" is outside the normal range ({min} - {max}). Are you sure it\'s correct?',
    confirm: 'Confirm',
    cancel: 'Cancel',

    roundAlreadyDoneTitle: 'Round already registered',
    roundAlreadyDoneMsg: 'This equipment already has a round recorded in the current window. You cannot submit another until the next window.',
    close: 'Close',
  },
};

function loadLang() {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === 'es' || saved === 'en') return saved;
  const nav = (navigator.language || 'es').toLowerCase();
  return nav.startsWith('en') ? 'en' : 'es';
}

function nowLocalParts() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` };
}

function formatHMS(totalSec) {
  if (totalSec == null) return '--:--:--';
  const s = Math.max(0, totalSec | 0);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}

// Normaliza URLs relativas que vienen del backend (por ejemplo "media/...")
const absUrl = (u) => {
  if (!u) return '';
  const clean = String(u).replace(/\\/g, '/');
  return clean.startsWith('http') ? clean : `${API_BASE}/${clean}`;
};

const RondaEquipo = () => {
  const { equipoId } = useParams();
  const navigate = useNavigate();

  // Idioma
  const [lang, setLang] = useState(loadLang);
  const t = useMemo(() => i18n[lang] ?? i18n.es, [lang]);
  const locale = lang === 'en' ? 'en-US' : 'es-CO';

  // Estado
  const [equipo, setEquipo] = useState(null);
  const [campos, setCampos] = useState([]);
  const [valores, setValores] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [rondaExistente, setRondaExistente] = useState(null); // Para cargar datos existentes

  // manejo de horario
  const [fecha, setFecha] = useState(nowLocalParts().date);
  const [hora, setHora] = useState(nowLocalParts().time);
  const [observaciones, setObservaciones] = useState('');
  const [buqueId, setBuqueId] = useState(null);
  
  // Nuevos estados para horómetro y foto
  const [horometro, setHorometro] = useState('');
  const [fotoRonda, setFotoRonda] = useState(null); // File object o URL
  const [fotoPreview, setFotoPreview] = useState(null); // Base64 preview

  // Reloj visible (solo UI)
  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    const tmr = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(tmr);
  }, []);
  const reloj = useMemo(
    () => new Date(tick).toLocaleString(locale, { timeZone: tzLabel }),
    [tick, locale]
  );

  // Funciones para manejo de foto usando SweetAlert2 como en Rondas.js
  const handleTakePhoto = () => {
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
        // Asegurar que el popup adopte la variante estrecha
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
              onPhotoTaken={(file, preview) => {
                setFotoRonda(file);
                setFotoPreview(preview);
                Swal.close();
              }}
              onCancel={() => Swal.close()}
              t={t}
            />
          );
        }
        // Fallback adicional: intentar forzar reproducción si el video se monta pero no inicia
        setTimeout(() => {
          try {
            const vid = document.querySelector('#camera-swal-root video');
            if (vid && vid.paused) {
              vid.play().catch(()=>{});
            }
          } catch(_) {}
        }, 900);
      },
      willClose: () => {
        if (root) {
          root.unmount();
          root = null;
        }
        // Detener cualquier stream de video activo
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
        
        // Reintentos diferidos para asegurar limpieza completa
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

  const handleRemovePhoto = () => {
    setFotoRonda(null);
    setFotoPreview(null);
  };

  // Escuchar cambios de idioma desde el Navbar
  useEffect(() => {
    const handler = (e) => setLang(e.detail.lang);
    window.addEventListener('app:language', handler);
    return () => window.removeEventListener('app:language', handler);
  }, []);

  // === Preview de imagen (modal) ===
  const [imgPreview, setImgPreview] = useState({ open: false, url: '', name: '' });
  // Modal confirmación de fuera de rango
  const [pendingOutOfRange, setPendingOutOfRange] = useState(null); // {paramId, value, prevValue, paramName, min, max}

  // Layout simplificado: se usa un grid fijo de 2 columnas definido en CSS.

  // Carga inicial
  useEffect(() => {
    const run = async () => {
      try {
        setCargando(true);
        setError('');

        // Detalle de equipo
        const { data: eq } = await api.get(`/equipos/${equipoId}/`);
        if (!eq?.id) throw new Error(t.teamNotFound);
        setEquipo(eq);
        setBuqueId(eq?.buque_id ?? null);

        // Parámetros seleccionados para ronda (detalle)
        const { data: baseLista } = await api.get(`/equipos/${equipoId}/parametros-detalle/`);

        // Mapa de imágenes por parámetro que viene en el detalle del equipo
        const imgMap = eq?.parametros_imagenes || {};

        // Enriquecemos cada parámetro con su (primera) imagen disponible
        const lista = (Array.isArray(baseLista) ? baseLista : []).map(p => ({
          ...p,
          _imgs: (imgMap[p.id] || []).map(it => ({
            id: it.id,
            name: it.name || 'foto',
            url: absUrl(it.url),
            nota: it.nota || ''
          }))
        }));

        setCampos(lista);

        const init = {};
        lista.forEach(p => { init[p.id] = ''; });
        setValores(init);

        // Intentar cargar ronda existente de la ventana actual
        try {
          // Primero verificar el estado del equipo en la ventana actual
          const qsEstado = new URLSearchParams();
          if (eq?.buque_id) qsEstado.set('buque_id', eq.buque_id);
          qsEstado.set('equipo_id', equipoId);
          
          const { data: estadoVentana } = await api.get(`/rondas/estado/?${qsEstado.toString()}`);
          
          // Si hay ronda realizada en la ventana actual (ya sea que esté activa o no), cargar datos
          if (estadoVentana?.already_done) {
            console.log('🔍 Ronda ya realizada detectada, cargando datos...');
            
            // Buscar la ronda más reciente de este equipo
            const qs = new URLSearchParams();
            if (eq?.buque_id) qs.set('buque_id', eq.buque_id);
            qs.set('equipo_id', equipoId);
            qs.set('page_size', '1');
            
            const { data: response } = await api.get(`/rondas/?${qs.toString()}`);
            if (response && response.results && response.results.length > 0) {
              const rondaReciente = response.results[0];
              
              // Obtener detalles completos de la ronda
              const { data: rondaCompleta } = await api.get(`/rondas/${rondaReciente.id}/`);
              
              if (rondaCompleta && rondaCompleta.lecturas) {
                console.log('✅ Cargando datos de ronda existente:', rondaCompleta.id);
                setRondaExistente(rondaCompleta);
                
                // Cargar valores existentes
                const valoresExistentes = {};
                lista.forEach(p => { valoresExistentes[p.id] = ''; });
                
                rondaCompleta.lecturas.forEach(lectura => {
                  if (valoresExistentes.hasOwnProperty(lectura.parametro_id)) {
                    valoresExistentes[lectura.parametro_id] = lectura.valor.toString();
                  }
                });
                
                setValores(valoresExistentes);
                
                // Cargar fecha, hora y observaciones existentes
                if (rondaCompleta.tomado_en) {
                  const fecha = new Date(rondaCompleta.tomado_en);
                  const yyyy = fecha.getFullYear();
                  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
                  const dd = String(fecha.getDate()).padStart(2, '0');
                  const hh = String(fecha.getHours()).padStart(2, '0');
                  const mi = String(fecha.getMinutes()).padStart(2, '0');
                  setFecha(`${yyyy}-${mm}-${dd}`);
                  setHora(`${hh}:${mi}`);
                }
                
                if (rondaCompleta.observaciones) {
                  setObservaciones(rondaCompleta.observaciones);
                }
              }
            }
          } else {
            console.log('ℹ️ No hay ronda realizada en ventana actual, modo creación normal');
            setRondaExistente(null);
          }
        } catch (error) {
          console.log('⚠️ Error al verificar/cargar ronda existente:', error);
          setRondaExistente(null);
        }
      } catch (e) {
        console.error(e);
        setError(e.message || t.genericLoadError);
      } finally {
        setCargando(false);
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipoId]);


  const handleChangeValor = (paramId, val) => {
    setValores(prev => ({ ...prev, [paramId]: val }));
  };

  // Función para manejar navegación con Enter
  const handleKeyDown = (e, paramId) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Evitar envío del formulario
      
      // Encontrar el siguiente parámetro
      const currentIndex = campos.findIndex(p => p.id === paramId);
      const nextIndex = currentIndex + 1;
      
      if (nextIndex < campos.length) {
        // Mover al siguiente parámetro
        const nextParamId = campos[nextIndex].id;
        const nextInput = document.getElementById(`p-${nextParamId}`);
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      } else {
        // Si es el último parámetro, quitar el foco
        e.target.blur();
      }
    }
  };

  const handleBlurValor = (param) => {
    const { id, valor_minimo, valor_maximo, nombre } = param;
    const raw = valores[id];
    if (raw === '' || raw == null) return; // vacío: no validar
    const num = parseFloat(raw);
    if (isNaN(num)) return;
    const min = valor_minimo;
    const max = valor_maximo;
    let fuera = false;
    if (min != null && num < min) fuera = true;
    if (max != null && num > max) fuera = true;
    if (fuera) {
      setPendingOutOfRange({
        paramId: id,
        value: raw,
        prevValue: prevValoresRef.current[id],
        paramName: nombre,
        min: min != null ? min : '—',
        max: max != null ? max : '—'
      });
    }
  };

  // Guardamos referencia a los valores previos para revertir si se cancela
  const prevValoresRef = useRef({});
  useEffect(() => {
    prevValoresRef.current = valores;
  }, [valores]);

  const confirmOutOfRange = () => {
    setPendingOutOfRange(null);
  };
  const cancelOutOfRange = () => {
    if (pendingOutOfRange) {
      const { paramId, prevValue } = pendingOutOfRange;
      setValores(v => ({ ...v, [paramId]: prevValue ?? '' }));
    }
    setPendingOutOfRange(null);
  };

  const buildTomadoEnISO = () => {
    // Enviar timestamp como "naive" (sin zona horaria) para evitar conversiones UTC
    // Django lo interpretará directamente como hora local Colombia
    return `${fecha}T${hora}:00`;
  };

  // === NUEVO: estado de ventana para este equipo ===
  const [estadoRonda, setEstadoRonda] = useState(null);
  const [countdownOpen, setCountdownOpen] = useState(null);
  const [countdownClose, setCountdownClose] = useState(null);
  const pollRef = useRef(null);
  const refreshRef = useRef(null);

  useEffect(() => {
    const fetchEstado = async () => {
      try {
        if (!equipoId) return;
        const qs = new URLSearchParams();
        if (buqueId) qs.set('buque_id', buqueId);
        qs.set('equipo_id', equipoId);

        const { data } = await api.get(`/rondas/estado/?${qs.toString()}`);
        setEstadoRonda(data);
        setCountdownOpen(data?.remaining_to_open_sec ?? null);
        setCountdownClose(data?.remaining_to_close_sec ?? null);
      } catch {
        /* silencio */
      }
    };

    fetchEstado();

    // countdown local por segundo
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      setCountdownOpen(c => (c != null ? Math.max(0, c - 1) : null));
      setCountdownClose(c => (c != null ? Math.max(0, c - 1) : null));
    }, 1000);

    // refresco del estado cada 15s
    if (refreshRef.current) clearInterval(refreshRef.current);
    refreshRef.current = setInterval(fetchEstado, 15000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [equipoId, buqueId]);


  const allowedNow = !!estadoRonda?.allowed_now;
  const alreadyDone = !!estadoRonda?.already_done;

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validar que todos los campos tengan valores
    const camposVacios = campos.filter(p => {
      const valor = valores[p.id];
      return valor === '' || valor === null || valor === undefined;
    });

    if (camposVacios.length > 0) {
      alert(t.missingReadings);
      // Enfocar el primer campo vacío
      const primerVacio = camposVacios[0];
      const input = document.getElementById(`p-${primerVacio.id}`);
      if (input) {
        input.focus();
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    const lecturas = Object.entries(valores)
      .filter(([, v]) => v !== '' && v !== null && v !== undefined)
      .map(([k, v]) => ({
        parametro_id: parseInt(k, 10),
        valor: parseFloat(v)
      }));

    if (lecturas.length === 0) {
      alert(t.noReadingsToSave);
      return;
    }

    // Preparar FormData para incluir la foto si existe
    const formData = new FormData();
    formData.append('equipo_id', parseInt(equipoId, 10));
    formData.append('tomado_en', buildTomadoEnISO());
    formData.append('observaciones', observaciones || '');
    formData.append('horometro', horometro || '');
    formData.append('tomado_por', '');
    formData.append('lecturas', JSON.stringify(lecturas));
    formData.append('actualizar_existente', !!alreadyDone);
    
    // Agregar foto si existe
    if (fotoRonda) {
      formData.append('foto_ronda', fotoRonda);
    }

    const payload = formData;

    try {
      // Crear la ronda (el backend manejará si es actualización o creación nueva)
      const response = await api.post(`/rondas/`, payload, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      // Opcional: mostrar mensaje según si fue creación o actualización
      if (response.data?.action === 'actualizada') {
        console.log('Ronda actualizada exitosamente');
      } else {
        console.log('Ronda creada exitosamente');
      }
      
      navigate('/rondas');
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data ? JSON.stringify(err.response.data) : (err.message || t.saveErrorPrefix);
      alert(msg);
    }
  };


  if (cargando) return <div className="container mt-4">{t.loading}</div>;
  if (error) return <div className="container mt-4 text-danger">{t.errorPrefix}: {error}</div>;

  return (
    <>
      {/* === CARD DE ESTADO (arriba del ronda-card) === */}
      {estadoRonda && (
        <div className="container mt-3" style={{ maxWidth: 560 }}>
          <div className="d-flex justify-content-between align-items-center shadow-sm rounded border px-3 py-2">
            <div>
              <strong>{allowedNow ? t.windowActive : t.windowClosed}</strong>
            </div>
            <div>
              {allowedNow ? t.timeLeftShort : t.opensInShort}:&nbsp;
              <strong>{formatHMS(allowedNow ? countdownClose : countdownOpen)}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Modal bloqueo si ya está hecha la ronda (entrada por QR o navegación directa) */}
      {/* REMOVIDO: Ya no bloqueamos la edición de rondas existentes */}

  <div className="container ronda-card mt-3 p-4 shadow rounded">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h4 className="mb-0">
              {t.roundOf}: {equipo?.nombre_equipo}
              {alreadyDone && (
                <small className="text-success ms-2">
                  <i className="bi bi-pencil-square" /> (Editando ronda existente)
                </small>
              )}
            </h4>
            <small className="text-muted">
              {t.timezone}: {tzLabel} {t.sepDot} {t.now}: {reloj}
            </small>
          </div>
          <button className="btn btn-secondary" onClick={() => navigate('/rondas')}>
            {t.back}
          </button>
        </div>

        {campos.length === 0 ? (
          <div className="alert alert-info">
            {t.noParamsTitle} {t.noParamsHelp} <b>{t.manageEquip}</b>.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Bloque fecha/hora/horómetro */}
            <div className="row g-3 mb-3">
              <div className="col-md-3">
                <label className="form-label">{t.dateOfReading}</label>
                <input
                  type="date"
                  className="form-control"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  required
                />
              </div>
              <div className="col-md-3">
                <label className="form-label">{t.timeOfReading}</label>
                <input
                  type="time"
                  className="form-control"
                  value={hora}
                  onChange={(e) => setHora(e.target.value)}
                  required
                />
              </div>
              <div className="col-md-3">
                <label className="form-label">{t.hourMeter}</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  className="form-control"
                  placeholder={t.hourMeterPh}
                  value={horometro}
                  onChange={(e) => setHorometro(e.target.value)}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label">{t.roundPhoto}</label>
                <div className="d-flex gap-2">
                  {!fotoRonda ? (
                    <button
                      type="button"
                      className="btn btn-outline-primary btn-sm camera-btn"
                      onClick={handleTakePhoto}
                    >
                      <Icon name="camera" size={16} className="camera-icon" />
                      {t.takePhoto}
                    </button>
                  ) : (
                    <div className="d-flex align-items-center gap-2">
                      <span className="text-success small">✓ {t.photoTaken}</span>
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm"
                        onClick={handleRemovePhoto}
                      >
                        ✕ {t.removePhoto}
                      </button>
                    </div>
                  )}
                </div>
                {fotoPreview && (
                  <div className="mt-2">
                    <img
                      src={fotoPreview}
                      alt="Preview"
                      className="foto-preview"
                      style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px' }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Bloque observaciones */}
            <div className="row g-3 mb-3">
              <div className="col-12">
                <label className="form-label">{t.observations}</label>
                <textarea
                  className="form-control"
                  rows="3"
                  placeholder={t.observationsPh}
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                />
              </div>
            </div>

            {/* ===== Lecturas: grid 2 columnas ===== */}
            <div className="param-grid">
              {(campos || []).map(p => (
                <div key={p.id}>
                  <div className="param-card">
                        {/* Miniatura izquierda */}
                        <div className="param-thumb-wrap">
                          {p._imgs?.length ? (
                            <img
                              src={p._imgs[0].url}
                              alt={p._imgs[0].name}
                              className="param-thumb"
                              onClick={() => setImgPreview({ open: true, url: p._imgs[0].url, name: p.nombre })}
                            />
                          ) : (
                            <div className="param-thumb param-thumb--placeholder" title="Sin imagen">
                              <i className="bi bi-image" />
                            </div>
                          )}
                        </div>

                        {/* Meta derecha */}
                        <div className="param-meta">
                          <div className="input-group floating-with-unit">
                            <div className="form-floating flex-grow-1">
                              <input
                                /* Mantiene tipo number para validación nativa, pero añadimos inputMode para forzar teclado numérico en tablets/móviles */
                                type="number"
                                inputMode="decimal"
                                pattern="[0-9]*[.,]?[0-9]*"
                                step="any"
                                className={`form-control ${(() => {
                                  const val = valores[p.id];
                                  if (val === '' || val == null) return '';
                                  const num = parseFloat(val);
                                  if (isNaN(num)) return '';
                                  if (p.valor_minimo != null && num < p.valor_minimo) return 'is-out-range';
                                  if (p.valor_maximo != null && num > p.valor_maximo) return 'is-out-range';
                                  return '';
                                })()}`}
                                id={`p-${p.id}`}
                                placeholder=" "
                                value={valores[p.id] ?? ''}
                                onChange={(e) => handleChangeValor(p.id, e.target.value)}
                                onBlur={() => handleBlurValor(p)}
                                onKeyDown={(e) => handleKeyDown(e, p.id)}
                              />
                              <label
                                htmlFor={`p-${p.id}`}
                                className="param-label"
                                title={p.nombre}
                              >
                                {p.nombre}
                              </label>
                            </div>
                            <span className="input-group-text">{p.unidad || ''}</span>
                          </div>
                          <div className="minmax-hint">
                            {t.minShort}: {p.valor_minimo ?? '—'} {t.sepDot} {t.maxShort}: {p.valor_maximo ?? '—'}
                          </div>
                        </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="d-flex justify-content-end mt-4">
              <button type="submit" className="btn btn-primary">
                {alreadyDone ? 'Actualizar ronda' : t.saveReading}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Modal preview de imagen */}
      {pendingOutOfRange && (
        <div className={`modal fade show d-block`} tabIndex="-1" role="dialog" style={{ background: 'rgba(0,0,0,0.35)' }}>
          <div className="modal-dialog" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h6 className="modal-title">{t.outRangeTitle}</h6>
                <button type="button" className="btn-close" aria-label="Close" onClick={cancelOutOfRange} />
              </div>
              <div className="modal-body">
                <p style={{ whiteSpace: 'pre-line' }}>
                  {t.outRangeMsg
                    .replace('{name}', pendingOutOfRange.paramName)
                    .replace('{min}', pendingOutOfRange.min)
                    .replace('{max}', pendingOutOfRange.max)}
                </p>
                <ul className="small text-muted mb-0">
                  <li>{t.minShort}: {pendingOutOfRange.min}</li>
                  <li>{t.maxShort}: {pendingOutOfRange.max}</li>
                  <li>{t.now}: {pendingOutOfRange.value}</li>
                </ul>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={cancelOutOfRange}>{t.cancel}</button>
                <button type="button" className="btn btn-danger" onClick={confirmOutOfRange}>{t.confirm}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className={`modal fade ${imgPreview.open ? 'show d-block' : ''}`}
        tabIndex="-1"
        role="dialog"
        style={{ background: imgPreview.open ? 'rgba(0,0,0,0.35)' : 'transparent' }}
      >
        <div className="modal-dialog modal-lg" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h6 className="modal-title text-truncate">{imgPreview.name || 'Vista previa'}</h6>
              <button
                type="button"
                className="btn-close"
                aria-label="Close"
                onClick={() => setImgPreview({ open: false, url: '', name: '' })}
              />
            </div>
            <div className="modal-body">
              {imgPreview.url ? (
                <img
                  src={imgPreview.url}
                  alt={imgPreview.name}
                  style={{ maxWidth: '100%', maxHeight: '75vh', display: 'block', margin: '0 auto' }}
                />
              ) : (
                <div className="text-muted">No disponible.</div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setImgPreview({ open: false, url: '', name: '' })}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default RondaEquipo;
