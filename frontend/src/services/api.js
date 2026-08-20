// src/services/api.js
// Cliente axios con cookies HttpOnly + auto-refresh robusto
import axios from "axios";
import { API_BASE } from '../config';

// Aseguramos que la instancia axios use la base configurada en un solo lugar.
// Si en config.js defines 'http://IP:PUERTO' sin /api, aquí se añade.
// Si ya incluye /api, no se duplica.
const normalizedBase = /\/api\/?$/.test(API_BASE) ? API_BASE.replace(/\/$/, '') : `${API_BASE.replace(/\/$/, '')}/api`;

const api = axios.create({
  baseURL: normalizedBase,
  // En versión lite no usamos cookies ni sesión; evitamos credenciales para simplificar CORS
  withCredentials: false,
});

// --- Refresh lock + cola de pendientes (para múltiples 401 simultáneos) ---
let isRefreshing = false;
let waitQueue = []; // { resolve }
let refreshCooldownUntil = 0; // timestamp ms para evitar bucles de refresh tras fallo

// Interceptor de REQUEST: si estamos en cooldown por fallo de refresh, evitamos
// disparar peticiones a endpoints protegidos para no saturar el backend.
api.interceptors.request.use((config) => {
  try {
    const u = new URL(config.url || "", api.defaults.baseURL);
    const path = u.pathname;
    const now = Date.now();
    const isAuthPath = path.startsWith("/api/auth/") || path.startsWith("/auth/");
    if (!isAuthPath && now < refreshCooldownUntil) {
      // Cancelamos silenciosamente; el caller recibirá un error cancelado.
      const cancelError = new axios.Cancel("Auth cooldown active");
      throw cancelError;
    }
  } catch (_) {
    // Si no podemos parsear la URL, no bloqueamos la petición.
  }
  return config;
});

const subscribe = (cb) => waitQueue.push({ resolve: cb });
const notifyAll = () => {
  waitQueue.forEach(({ resolve }) => resolve());
  waitQueue = [];
};

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { response, config } = error || {};
    if (!response) {
      console.log('[API][RESP] Network/other error sin response:', error?.message);
      return Promise.reject(error);
    } // error de red

    const status = response.status;
    const original = config || {};
    // Normaliza URL para detectar rutas /api/auth/* aunque sea absoluta
    let isAuthUrl = false;
    try {
      const u = new URL(original?.url || "", api.defaults.baseURL);
      const path = u.pathname; // p.ej. /api/auth/me ó /auth/me
      isAuthUrl = path.startsWith("/api/auth/") || path.startsWith("/auth/");
    } catch (_) {
      // fallback al método anterior
      const raw = original?.url || "";
      isAuthUrl = raw.startsWith("/auth/") || raw.startsWith("auth/") || raw.includes('/auth/');
    }

    // Solo intentamos refresh en 401, una vez, y nunca sobre /auth/*
    if (status === 401 && !original.__isRetry && !isAuthUrl) {
      console.log('[API][401] Interceptado 401 en', original?.url, 'isRefreshing=', isRefreshing);
      // Si recientemente falló el refresh, evita reintentos por un breve periodo
      const now = Date.now();
      if (now < refreshCooldownUntil) {
        console.log('[API][401] En cooldown hasta', new Date(refreshCooldownUntil).toISOString());
        return Promise.reject(error);
      }
      // Si ya hay un refresh en curso, espera y reintenta cuando termine
      if (isRefreshing) {
        console.log('[API][401] Ya hay refresh en curso. Encolando', original?.url);
        return new Promise((resolve) => {
          subscribe(() => resolve(api(original)));
        });
      }

      original.__isRetry = true;
      isRefreshing = true;
      try {
        console.log('[API][401] Lanzando refresh...');
        await api.post("/auth/refresh"); // usa cookie refresh_token HttpOnly
        console.log('[API][401] Refresh OK. Reintentando original');
        isRefreshing = false;
        notifyAll(); // despierta pendientes
        return api(original); // reintenta la original
      } catch (e) {
        console.log('[API][401] Refresh falló. status=', e?.response?.status, 'mensaje=', e?.message);
        isRefreshing = false;
        waitQueue = [];
        // Activa cooldown para evitar bucles de refresh
        refreshCooldownUntil = Date.now() + 10000; // 10s de pausa
        // Sin AuthContext, no redirigimos a login
        return Promise.reject(e);
      }
    } else if (status === 401 && isAuthUrl) {
      console.log('[API][401] 401 en endpoint auth (sin refresh):', original?.url);
    }

    return Promise.reject(error);
  }
);

// Funciones específicas para el Dashboard
export const fetchBuques = async () => {
  const response = await api.get('/buques/');
  return response.data;
};

export const fetchBuqueById = async (buqueId) => {
  // Usa el endpoint de detalle ya disponible en Django: path('api/buque/<int:buque_id>/')
  const response = await api.get(`/buque/${buqueId}/`);
  return response.data;
};

export const fetchEquiposPorBuque = async (buqueId) => {
  const response = await api.get(`/equipos-por-buque/?buque_id=${buqueId}`);
  return response.data;
};

export const fetchParametrosPorEquipo = async (equipoId) => {
  const response = await api.get(`/equipos/${equipoId}/parametros-detalle/`);
  return response.data;
};

// Nuevo: obtener parámetros seleccionados de todos los equipos de un buque o lista específica
export const fetchParametrosBatchPorBuque = async ({ buqueId, equiposIds }) => {
  const params = new URLSearchParams();
  if (equiposIds && equiposIds.length) {
    params.set('equipos', equiposIds.join(','));
  } else if (buqueId != null) {
    params.set('buque_id', buqueId);
  } else {
    throw new Error('Debe indicar buqueId o equiposIds');
  }
  const { data } = await api.get(`/equipos/parametros-detalle-batch/?${params.toString()}`);
  return data; // { equipos: { [id]: { equipo_id, parametros: [...] } }, total_equipos, total_parametros }
};

export const fetchRondasEquiposParametros = async () => {
  const response = await api.get('/rondas-equipos-parametros/');
  return response.data;
};

// Nueva función para obtener datos específicos de un equipo y parámetro
export const fetchLecturasEquipoParametro = async (equipoId, parametroId) => {
  const response = await api.get(`/lecturas/${equipoId}/${parametroId}/`);
  return response.data;
};

export const generateTestData = async () => {
  const response = await api.post('/generate-test-data/');
  return response.data;
};

export const generateTestDataBatch = async (equiposParametros) => {
  const response = await api.post('/generate-test-data-batch/', {
    equipos_parametros: equiposParametros
  });
  return response.data;
};

export const generateSingleTestData = async (equipoId, parametroId) => {
  const response = await api.post('/generate-test-data-single/', {
    equipo_id: equipoId,
    parametro_id: parametroId
  });
  return response.data;
};

export const deleteTestData = async () => {
  const response = await api.delete('/delete-test-data/');
  return response.data;
};


// ─────────────────────────────────────────────────────────────────────────────
// Inspección IA (visión artificial)
// ─────────────────────────────────────────────────────────────────────────────

/** Catálogo de secciones del casco */
export const fetchSeccionesCasco = async () => {
  const { data } = await api.get('/vision/secciones/');
  return data;
};

/** Lista inspecciones (opcionalmente filtradas por buque) */
export const fetchInspecciones = async (buqueId) => {
  const params = buqueId ? `?buque_id=${buqueId}` : '';
  const { data } = await api.get(`/vision/inspecciones/${params}`);
  return data;
};

/** Crear una nueva inspección */
export const crearInspeccion = async ({ buqueId, descripcion, tomadoPor }) => {
  const { data } = await api.post('/vision/inspecciones/', {
    buque_id: buqueId,
    descripcion: descripcion || '',
    tomado_por: tomadoPor || '',
  });
  return data;
};

/** Detalle de inspección con todas sus fotos */
export const fetchInspeccionDetalle = async (inspeccionId) => {
  const { data } = await api.get(`/vision/inspecciones/${inspeccionId}/`);
  return data;
};

/**
 * Abre un stream SSE (Server-Sent Events) para una inspección.
 * Empuja eventos en tiempo real cuando cambia el estado de sus fotos.
 *
 * @param {number} inspeccionId
 * @param {{onUpdate?: (payload: object) => void, onReady?: (payload: object) => void, onError?: (err: any) => void}} handlers
 * @returns {EventSource} llamar `.close()` para cerrar el stream
 */
/**
 * Normaliza un path de media a URL absoluta.
 * El worker Celery no tiene `request` para construir absolute URI,
 * así que los payloads SSE traen paths relativos (ej. "media/...").
 * El GET inicial usa `request.build_absolute_uri` y trae URL absoluta;
 * para que el merge no pise la URL buena con un path roto, normalizamos aquí.
 */
const _absMediaUrl = (path) => {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path; // ya absoluta
  const host = API_BASE.replace(/\/$/, '');
  return `${host}/${String(path).replace(/^\/+/, '')}`;
};

/** Normaliza paths de media (imagen_original / imagen_anotada) en un dict de foto. */
const _normalizeFoto = (foto) => {
  if (!foto) return foto;
  return {
    ...foto,
    imagen_original: _absMediaUrl(foto.imagen_original),
    imagen_anotada: _absMediaUrl(foto.imagen_anotada),
  };
};

export const abrirStreamInspeccion = (inspeccionId, handlers = {}) => {
  const url = `${normalizedBase}/vision/inspecciones/${inspeccionId}/stream/`;
  const es = new EventSource(url);

  es.addEventListener('ready', (e) => {
    try { handlers.onReady?.(JSON.parse(e.data)); } catch (_) {}
  });

  // Cambio de estado durante el procesado YOLO
  es.addEventListener('foto-updated', (e) => {
    try {
      const payload = JSON.parse(e.data);
      if (payload.imagen_anotada) payload.imagen_anotada = _absMediaUrl(payload.imagen_anotada);
      if (payload.imagen_original) payload.imagen_original = _absMediaUrl(payload.imagen_original);
      handlers.onUpdate?.(payload);
    } catch (err) {
      console.warn('[SSE] payload inválido (foto-updated)', err);
    }
  });

  // Nueva foto subida a la inspección (por este u otro cliente)
  es.addEventListener('foto-created', (e) => {
    try {
      const { foto } = JSON.parse(e.data);
      handlers.onCreated?.(_normalizeFoto(foto));
    } catch (err) {
      console.warn('[SSE] payload inválido (foto-created)', err);
    }
  });

  // Foto eliminada de la inspección
  es.addEventListener('foto-deleted', (e) => {
    try {
      handlers.onDeleted?.(JSON.parse(e.data));
    } catch (err) {
      console.warn('[SSE] payload inválido (foto-deleted)', err);
    }
  });

  es.onerror = (err) => {
    // EventSource reintenta solo. Sólo notificamos al consumidor.
    handlers.onError?.(err);
  };

  return es;
};

/** Subir foto a una inspección (multipart) */
export const subirFotoInspeccion = async (inspeccionId, { imagen, seccionId }) => {
  const fd = new FormData();
  fd.append('imagen', imagen);
  fd.append('seccion_id', seccionId);
  const { data } = await api.post(
    `/vision/inspecciones/${inspeccionId}/fotos/`,
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return data;
};

/** Estado de una foto — consulta puntual (el progreso en vivo llega por SSE) */
export const fetchFotoDetalle = async (fotoId) => {
  const { data } = await api.get(`/vision/fotos/${fotoId}/`);
  return data;
};

/** Disparar análisis de una foto (pendiente o error) */
export const reintentarFoto = async (fotoId) => {
  const { data } = await api.post(`/vision/fotos/${fotoId}/`);
  return data;
};

/** Eliminar una foto y sus archivos */
export const eliminarFoto = async (fotoId) => {
  await api.delete(`/vision/fotos/${fotoId}/`);
};

/** Eliminar una inspección completa (fotos + archivos físicos) */
export const eliminarInspeccion = async (inspeccionId) => {
  await api.delete(`/vision/inspecciones/${inspeccionId}/`);
};

/** Iniciar análisis YOLO para todas las fotos pendientes de una inspección */
export const iniciarAnalisis = async (inspeccionId) => {
  const { data } = await api.post(`/vision/inspecciones/${inspeccionId}/analizar/`);
  return data;
};


export default api;
