// src/components/SWBS.jsx
import React, { useEffect, useMemo, useState, useRef, useLayoutEffect, useCallback } from 'react';
import './GestionEquipos.css';
import { API_BASE } from '../config';
import EquipoForm from './EquipoForm';
import api from '../services/api';


const asArray = (payload) =>
   Array.isArray(payload) ? payload : (Array.isArray(payload?.results) ? payload.results : []);

// Cambia a true si deseas auto-seleccionar al entrar a SWBS
const AUTO_SELECT_ON_ENTER = false;
const DEFAULT_GROUP_ID = 2;

// Grupos constructivos por defecto (fallback) - Solo los que estaban activos anteriormente
const GRUPOS_CONSTRUCTIVOS_DEFAULT = [
  { id: 1, ref: '100', label: 'Estructura del Casco', activo: false },
  { id: 2, ref: '200', label: 'Planta Propulsora', activo: true },
  { id: 3, ref: '300', label: 'Planta Eléctrica', activo: true },
  { id: 4, ref: '400', label: 'Sistemas de Comando y Control', activo: false },
  { id: 5, ref: '500', label: 'Sistemas Auxiliares', activo: true },
  { id: 6, ref: '600', label: 'Equipamiento y Mobiliario', activo: false },
  { id: 7, ref: '700', label: 'Armamento', activo: false },
];


export default function SWBS() {
  // Sin autenticación - versión lite siempre como superuser
  const ROLE = 'superuser'; // Siempre superuser en versión lite
  const USER_BUQUE_ID = null;
  const USER_BUQUE_NOMBRE = null;

  // Vista general
  const [vista, setVista] = useState('buques'); // 'buques' | 'swbs'
  const [buques, setBuques] = useState([]);
  const [buqueSeleccionado, setBuqueSeleccionado] = useState(null);
  const [buqueNombre, setBuqueNombre] = useState('Sin selección');

  // Grupos constructivos dinámicos
  const [gruposConstructivos, setGruposConstructivos] = useState(GRUPOS_CONSTRUCTIVOS_DEFAULT);

  // Columna izquierda (swap interno)
  const [leftMode, setLeftMode] = useState('grupos'); // 'grupos' | 'equipos'
  const [toggleVisible, setToggleVisible] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const [fadingMode, setFadingMode] = useState(null); // 'grupos' | 'equipos'

  const [grupoSeleccionado, setGrupoSeleccionado] = useState(null);
  const [equipos, setEquipos] = useState([]);

  // Filtros
  const [filtros, setFiltros] = useState({ sistema: '', subsistema: '', nombre: '' });

  // Columna derecha (detalle embebido)
  const [equipoSeleccionado, setEquipoSeleccionado] = useState(null); // { id } | null
  const [mostrarForm, setMostrarForm] = useState(false);

  const [formData, setFormData] = useState({ equipoName: '', selectedDocument: null });
  const [selectedDocument, setSelectedDocument] = useState(null);

  // ======= NUEVO: catálogos por id (para construir etiquetas correctas) =======
  const [sistemasMap, setSistemasMap] = useState({});     // { [id]: { numero_de_referencia, descripcion } }
  const [subsistemasMap, setSubsistemasMap] = useState({}); // { [id]: { numero_de_referencia, descripcion } }


  // ---- helpers de orden ----
  const parseCreatedAt = (raw) => {
    if (!raw) return null;
    let s = String(raw).trim().replace(' ', 'T');
  if (!/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) s += 'Z';
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : null;
  };
  const createdAtOf = (e) =>
    parseCreatedAt(e.created_at ?? e.createdAt ?? e.created ?? e.fecha_creacion ?? e['fecha_creación']) ?? 0;
  const idOf   = (e) => (Number.isFinite(Number(e.id)) ? Number(e.id) : 0);
  const nameOf = (e) => String(e.nombre_equipo || '').trim();
  // Preferimos codigo_cj para orden y búsqueda; si no existe, referencia o id
  const refOf  = (e) => String(firstNonEmpty(e.codigo_cj, e.referencia, e.id, '')).trim();

  // Comparador CJ: numérico 1..9 antes que sufijos con letras para mismo prefijo
  const cleanCJ = (s) => String(s ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^0-9A-Z]/g, '');

  const cjParts = (s) => {
    const raw = cleanCJ(s);
    // Base: primeros 4 dígitos si existen; si no, todos los dígitos iniciales
    let m = raw.match(/^(\d{4})(.*)$/);
    if (!m) m = raw.match(/^(\d+)(.*)$/);
    if (!m) {
      return { raw, base: NaN, suffix: '', class: 3, suffixNum: NaN };
    }
    const base = parseInt(m[1], 10);
    const suffix = m[2] || '';
    if (!suffix) return { raw, base, suffix: '', class: -1, suffixNum: NaN };
    if (/^\d+$/.test(suffix)) return { raw, base, suffix, class: 0, suffixNum: parseInt(suffix, 10) };
    if (/^[A-Z]+$/.test(suffix)) return { raw, base, suffix, class: 1, suffixNum: NaN };
    return { raw, base, suffix, class: 2, suffixNum: NaN };
  };

  const cjCompare = (a, b) => {
    const A = cjParts(a);
    const B = cjParts(b);

    // Si alguno no tiene prefijo numérico, fallback a comparador natural
    if (Number.isNaN(A.base) || Number.isNaN(B.base)) {
      return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    }
    if (A.base !== B.base) return A.base - B.base;

    // Orden de clase: base (-1) < num (0) < alfa (1) < mixto (2)
  const clsA = A.class;
  const clsB = B.class;
    if (clsA !== clsB) return clsA - clsB;

    switch (clsA) {
      case -1:
        return 0; // ambos base
      case 0: {
        const nA = Number.isFinite(A.suffixNum) ? A.suffixNum : Number.POSITIVE_INFINITY;
        const nB = Number.isFinite(B.suffixNum) ? B.suffixNum : Number.POSITIVE_INFINITY;
        if (nA !== nB) return nA - nB;
        return 0;
      }
      case 1:
      case 2:
      default:
        return A.suffix.localeCompare(B.suffix, undefined, { sensitivity: 'base' });
    }
  };

  function firstNonEmpty(...args) {
    for (const v of args) {
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return '';
  }

  // Opciones de orden
  const SORT_OPTIONS = [
    { value: 'created_desc', label: 'Fecha de creación (más nuevos)' },
    { value: 'created_asc',  label: 'Fecha de creación (más antiguos)' },
    { value: 'name_asc',     label: 'Nombre (A→Z)' },
    { value: 'name_desc',    label: 'Nombre (Z→A)' },
    { value: 'ref_asc',      label: 'CJ (A→Z)' },
  ];

  const [sortBy, setSortBy] = useState(localStorage.getItem('swbs_sort_by') || 'created_desc');
  useEffect(() => { localStorage.setItem('swbs_sort_by', sortBy); }, [sortBy]);

  // -------------------------------
  // Cargar grupos constructivos desde buque
  // -------------------------------
  const cargarGruposConstructivos = async (buqueId) => {
    try {
      const { data } = await api.get(`/buque/${buqueId}/`);
      if (Array.isArray(data?.grupos_constructivos) && data.grupos_constructivos.length > 0) {
        // Solo mostrar grupos activos
        const gruposActivos = data.grupos_constructivos.filter(g => g.activo);
        setGruposConstructivos(gruposActivos.length > 0 ? gruposActivos : GRUPOS_CONSTRUCTIVOS_DEFAULT.filter(g => g.activo));
      } else {
        // Usar solo grupos activos por defecto si no hay configuración
        const gruposActivosDefault = GRUPOS_CONSTRUCTIVOS_DEFAULT.filter(g => g.activo);
        setGruposConstructivos(gruposActivosDefault);
      }
    } catch (err) {
      console.error('❌ Error al cargar grupos constructivos:', err);
      const gruposActivosDefault = GRUPOS_CONSTRUCTIVOS_DEFAULT.filter(g => g.activo);
      setGruposConstructivos(gruposActivosDefault);
    }
  };

  // -------------------------------
  // Buques
  // -------------------------------
  useEffect(() => {
    (async () => {
      try {
        if (ROLE === 'admin' || ROLE === 'null') {
          if (!USER_BUQUE_ID) {
            // No buque asignado: mostrar lista vacía y permanecer en estado bloqueado
            setBuques([]);
            setVista('swbs');
            setBuqueNombre('Sin asignación');
            return;
          }
          const { data } = await api.get(`/buque/${USER_BUQUE_ID}/`);
          const nombreFinal = USER_BUQUE_NOMBRE || data?.nombre || 'Sin selección';
          setBuques(data ? [data] : []);
          setBuqueSeleccionado(USER_BUQUE_ID);
          setBuqueNombre(nombreFinal);
          setVista('swbs');
          // Persistimos en localStorage para que otros componentes (que lean LS) no pidan selección
          localStorage.setItem('buqueSeleccionado', String(USER_BUQUE_ID));
          localStorage.setItem('buqueNombre', nombreFinal);
          // Cargar grupos constructivos
          await cargarGruposConstructivos(USER_BUQUE_ID);
        } else {
          const { data } = await api.get('/buques/');
          setBuques(asArray(data));
        }
      } catch (err) {
        console.error('❌ Error al cargar buques:', err);
        setBuques([]);
      }
    })();
  }, [ROLE, USER_BUQUE_ID, USER_BUQUE_NOMBRE]);

  const verEquipos = async (id, nombre) => {
    setBuqueSeleccionado(id);
    setBuqueNombre(nombre);
    localStorage.setItem('buqueSeleccionado', String(id));
    localStorage.setItem('buqueNombre', nombre);

    // reset
    setVista('swbs');
    setLeftMode('grupos');
    setToggleVisible(false);
    setIsFading(false);
    setFadingMode(null);
    setGrupoSeleccionado(null);
    setEquipoSeleccionado(null);
    setMostrarForm(false);
    setEquipos([]);
    setFiltros({ sistema: '', subsistema: '', nombre: '' });
    setSistemasMap({});
    setSubsistemasMap({});
    
    // Cargar grupos constructivos para este buque
    await cargarGruposConstructivos(id);
  };

  const handleVolver = () => {
    setVista('buques');
    setLeftMode('grupos');
    setToggleVisible(false);
    setIsFading(false);
    setFadingMode(null);
    setGrupoSeleccionado(null);
    setEquipoSeleccionado(null);
    setMostrarForm(false);
    setEquipos([]);
    setFiltros({ sistema: '', subsistema: '', nombre: '' });
    setSistemasMap({});
    setSubsistemasMap({});
  };

  const editarBuque = (id) => (window.location.href = `/buque/${id}/editar`);



  
  // -------------------------------
  // Animación de alternancia (fade / width)
  // -------------------------------
  const swapLeftMode = (toMode) => {
    if (leftMode === toMode || isFading) return;
    setIsFading(true);
    setFadingMode(leftMode);
    setTimeout(() => {
      setLeftMode(toMode);
      setIsFading(false);
      setFadingMode(null);
    }, 220);
  };

  // -------------------------------
  // Selección de grupo + carga equipos + carga catálogos
  // -------------------------------
  const seleccionarGrupo = (grupoId) => {
    setGrupoSeleccionado(grupoId);
    localStorage.setItem('grupoSeleccionado', String(grupoId));
    setFiltros({ sistema: '', subsistema: '', nombre: '' });
    setEquipoSeleccionado(null);
    setMostrarForm(false);
    setSistemasMap({});
    setSubsistemasMap({});
    cargarEquipos(grupoId, () => {
      setToggleVisible(true);
      swapLeftMode('equipos');
    });
  };


  const cargarEquipos = async (grupoId, cb) => {
    const buqueId = buqueSeleccionado ?? Number(localStorage.getItem('buqueSeleccionado'));
    if (!buqueId) return;

    try {
      const { data } = await api.get('/equipos/', {
        params: { grupo_id: grupoId, buque_id: buqueId },
      });

      const lista = Array.isArray(data)
        ? data
        : (Array.isArray(data?.results) ? data.results : []);

      setEquipos(lista);
      cb && cb();
    } catch (err) {
      console.error('❌ Error al cargar equipos:', err);
      setEquipos([]);
    }
  };


  // Auto-select grupo al entrar para admin/null
  useEffect(() => {
    if ((ROLE === 'admin' || ROLE === 'null') && vista === 'swbs' && buqueSeleccionado) {
      const saved = Number(localStorage.getItem('grupoSeleccionado') || 0);
      const initial = saved || DEFAULT_GROUP_ID;
      if (initial) seleccionarGrupo(initial);
    } else if (vista === 'swbs' && buqueSeleccionado && AUTO_SELECT_ON_ENTER) {
      const saved = Number(localStorage.getItem('grupoSeleccionado') || 0);
      const initial = saved || DEFAULT_GROUP_ID;
      if (initial) seleccionarGrupo(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, buqueSeleccionado]);



  // -------------------------------
  // Filtros desde data
  // -------------------------------
  // Opciones de sistemas (refactor: consolidado para evitar ReferenceError 'map is not defined')
  const opcionesSistemas = useMemo(() => {
    const map = new Map();

    const toSortNum = (v) => {
      const s = String(v ?? '').trim();
      return /^\d+$/.test(s) ? parseInt(s, 10) : Number.POSITIVE_INFINITY;
    };

    (equipos || []).forEach((e) => {
      if (!e?.sistema_id) return;

      const numero = e.sistema_numero_de_referencia;
      const desc   = e.sistema_descripcion;

      let label = '';
      if (numero && desc) label = `${numero} - ${desc}`;
      else if (numero)    label = String(numero);
      else if (desc)      label = String(desc);
      if (!label) return; // evita opciones vacías

      if (!map.has(e.sistema_id)) {
        map.set(e.sistema_id, { id: e.sistema_id, label, sortNum: toSortNum(numero) });
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.sortNum !== b.sortNum) return a.sortNum - b.sortNum;
      return a.label.localeCompare(b.label);
    });
  }, [equipos]);

const opcionesSubsistemas = useMemo(() => {
  const map = new Map();

  const toSortNum = (v) => {
    const s = String(v ?? '').trim();
    return /^\d+$/.test(s) ? parseInt(s, 10) : Number.POSITIVE_INFINITY;
  };

  (equipos || []).forEach((e) => {
    if (filtros.sistema && Number(e.sistema_id) !== Number(filtros.sistema)) return;
    if (!e?.subsistema_id) return;

    const numero = e.subsistema_numero_de_referencia;
    const desc   = e.subsistema_descripcion;

    let label = '';
    if (numero && desc) label = `${numero} - ${desc}`;
    else if (numero)    label = String(numero);
    else if (desc)      label = String(desc);

    if (!label) return;

    if (!map.has(e.subsistema_id)) {
      map.set(e.subsistema_id, { id: e.subsistema_id, label, sortNum: toSortNum(numero) });
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    if (a.sortNum !== b.sortNum) return a.sortNum - b.sortNum;
    return a.label.localeCompare(b.label);
  });
}, [equipos, filtros.sistema]);



  // -------------------------------
  // Filtrado y orden de equipos
  // -------------------------------
  const equiposFiltrados = useMemo(() => {
    const bySis = (e) => (filtros.sistema ? Number(e.sistema_id) === Number(filtros.sistema) : true);
    const bySub = (e) => (filtros.subsistema ? Number(e.subsistema_id) === Number(filtros.subsistema) : true);
    const byNom = (e) => {
      if (!filtros.nombre) return true;
      const val = filtros.nombre.toLowerCase();
      const nombre = (e.nombre_equipo || '').toLowerCase();
      const cj = (e.codigo_cj || e.referencia || e.id || '').toString().toLowerCase();
      return nombre.includes(val) || cj.includes(val);
    };

    const arr = (equipos || []).filter((e) => bySis(e) && bySub(e) && byNom(e));

    return arr.slice().sort((a, b) => {
      switch (sortBy) {
        case 'created_asc': {
          const ca = createdAtOf(a), cb = createdAtOf(b);
          if (ca !== cb) return ca - cb;
          return idOf(a) - idOf(b);
        }
        case 'name_asc': {
          const cmp = nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' });
          return cmp || (idOf(a) - idOf(b));
        }
        case 'name_desc': {
          const cmp = nameOf(b).localeCompare(nameOf(a), undefined, { sensitivity: 'base' });
          return cmp || (idOf(a) - idOf(b));
        }
        case 'ref_asc': {
          const cmp = cjCompare(refOf(a), refOf(b));
          return cmp || (idOf(a) - idOf(b));
        }
        case 'created_desc':
        default: {
          const ca = createdAtOf(a), cb = createdAtOf(b);
          if (ca !== cb) return cb - ca;      // más nuevos arriba
          return idOf(a) - idOf(b);           // desempate estable
        }
      }
    });
  }, [equipos, filtros, sortBy]);

  // -------------------------------
// Detalle derecho (EquipoForm embebido)
// -------------------------------
const abrirCrearEquipo = () => {
  console.log('Abrir Crear Equipo: Reiniciando equipo seleccionado');
  setEquipoSeleccionado(null); // Reinicia el equipo seleccionado
  setMostrarForm(true);        // Muestra el formulario para un nuevo equipo
};

const seleccionarEquipo = (eq) => {
  setEquipoSeleccionado({ id: eq.id });
  setMostrarForm(true);
};

const onSavedEquipo = ({ id /*, data, isNew */ }) => {
  if (!grupoSeleccionado) return;
  cargarEquipos(grupoSeleccionado, () => {
    setEquipoSeleccionado((prev) => (prev && prev.id === id ? prev : { id }));
    setMostrarForm(true);
  });
};

const onDeletedEquipo = (id) => {
  if (!grupoSeleccionado) {
    // Limpia sólo la UI
    setMostrarForm(false);
    setEquipoSeleccionado(null);
    return;
  }
  // Recargar listado y limpiar panel de detalle
  cargarEquipos(grupoSeleccionado, () => {
    setMostrarForm(false);
    setEquipoSeleccionado(null);
  });
};

const onCancelEquipo = () => {
  setMostrarForm(false);
  setEquipoSeleccionado(null);
};


  // -------------------------------
  // Partes UI
  // -------------------------------
  const renderPanelGrupos = () =>  (
    <div className="panel panel-grupos">
      <h3 className="titulo-col">Grupos</h3>
      <div className="grupos-lista">
        {gruposConstructivos.map((g) => (
          <button
            key={g.id}
            className={`grupo-row sin-imagen ${grupoSeleccionado === g.id ? 'activo' : ''}`}
            onClick={() => seleccionarGrupo(g.id)}
            title={`${g.ref} - ${g.label}`}
          >
            <span className="grupo-ref">{g.ref}</span>
            <span className="grupo-label">{g.label}</span>
          </button>
        ))}
      </div>
      <p className="text-muted small mt-2 text-center">Selecciona un grupo para ver sus equipos.</p>
    </div>
  );


  const renderPanelEquipos = () => (
    <div className="panel panel-equipos">
      <h3 className="titulo-col">Equipos</h3>

      <div className="row g-2 mb-2">
        <div className="col-6 relative floating-group" style={{ paddingRight: 5 }}>
          <select
            className="floating-input peer"
            value={filtros.sistema}
            onChange={(e) =>
              setFiltros((prev) => ({ ...prev, sistema: e.target.value, subsistema: '' }))
            }
          >
            <option value="">Todos los sistemas</option>
            {opcionesSistemas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <label className="floating-label">Filtrar por sistema</label>
        </div>

        <div className="col-6 relative floating-group" style={{ paddingLeft: 5 }}>
          <select
            className="floating-input peer"
            value={filtros.subsistema}
            onChange={(e) => setFiltros((prev) => ({ ...prev, subsistema: e.target.value }))}
          >
            <option value="">Todos los subsistemas</option>
            {opcionesSubsistemas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <label className="floating-label">Filtrar por subsistema</label>
        </div>

        <div className="col-12 relative floating-group mt-3">
          <input
            type="text"
            className="floating-input peer"
            value={filtros.nombre}
            onChange={(e) => setFiltros((prev) => ({ ...prev, nombre: e.target.value }))}
          />
          <label className="floating-label">Buscar equipo</label>
        </div>

        {/* Selector de orden */}
        <div className="col-12 relative floating-group mt-2">
          <select
            className="floating-input peer"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <label className="floating-label">Ordenar por</label>
        </div>

        {ROLE !== 'null' && (
          <div className="d-grid mx-auto mt-1">
            <button
              className="btn btn-secondary p-1"
              style={{ fontSize: 14 }}
              onClick={abrirCrearEquipo}
            >
              + Nuevo equipo
            </button>
          </div>
        )}
      </div>

      <div className="list-group-equipos" ref={listRef} style={{ maxHeight: listMaxHeight || undefined }}>
        {(!equipos || equipos.length === 0) && (
          <div className="no-equipos-msg text-center text-gray-500">
            {grupoSeleccionado ? 'No hay equipos en este grupo.' : 'Seleccione un grupo constructivo.'}
          </div>
        )}

        {equiposFiltrados.map((e) => (
          <button
            key={e.id}
            className={`equipo-item ${equipoSeleccionado?.id === e.id ? 'activo' : ''}`}
            onClick={() => seleccionarEquipo(e)}
            title={e.nombre_equipo}
          >
            <span className="equipo-ref">{e.codigo_cj || e.id}</span>
            <span className="equipo-nombre">{e.nombre_equipo}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderCardsBuques = () => (
    <>
      {/* Añadir buque/proyecto */}
      {ROLE === 'superuser' && (
      <div className="col-12 col-sm-6 col-md-4 col-lg-3 mb-4"> 
          <div className="card buque-card add-card" onClick={() => (window.location.href = '/buque/nuevo')} role="button">
            <div className="add-image-space d-flex justify-content-center align-items-center">
              <div className="add-icon">+</div>
            </div>
            <div className="card-body text-center">
              <h5 className="card-title">Añadir Buque / Proyecto</h5>
              <p className="card-text">Crear un nuevo proyecto</p>
            </div>
          </div>
      </div>
      )}

      {/* Tarjetas buques */}
      {buques.map((b) => {
        const imagenUrl = b.imagen
          ? (b.imagen.startsWith('http') ? b.imagen : `${API_BASE}/${b.imagen}`)
          : `/static/img/default_buque.svg`;
        return (
          <div key={b.id} className="col-12 col-sm-6 col-md-4 col-lg-3 mb-4">
            <div className="card buque-card">
              <span className="buque-etapa">{b.etapa}</span>
              <img
                src={imagenUrl}
                className="card-img-top"
                alt={b.nombre}
                loading="lazy"
                onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/static/img/default_buque.svg'; }}
              />
              <div className="card-body">
                <h5 className="card-title">{b.nombre}</h5>
                <div className="card-actions">
                  <button className="swbs-btn swbs-btn-ghost" onClick={() => verEquipos(b.id, b.nombre)} title="Ver equipos (SWBS)">
                    <span>Ver equipos</span>
                  </button>
                  <button className="swbs-btn swbs-btn-ghost" onClick={() => editarBuque(b.id)} title="Editar buque">
                    <span>Editar</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );

  // === Altura dinámica para la lista de equipos (ajustada al contenedor derecho) ===
const detalleRef = useRef(null);   // #detalle-equipo-container (columna derecha)
const listRef    = useRef(null);   // .list-group-equipos (columna izquierda)
const [listMaxHeight, setListMaxHeight] = useState(null);

// calcula: desde el top de la lista hasta el "bottom" del contenedor derecho
const recalcListMax = useCallback(() => {
  if (!detalleRef.current || !listRef.current) return;

  const detRect  = detalleRef.current.getBoundingClientRect();
  const listRect = listRef.current.getBoundingClientRect();

  // espacio disponible para que la lista llegue (visualmente) al mismo fondo del detalle
  const available = Math.floor(detRect.bottom - listRect.top - 8); // 8px colchón
  setListMaxHeight(`${Math.max(160, available)}px`);               // piso de 160px por UX
}, []);

useLayoutEffect(() => {
  recalcListMax();

  // observa cambios de tamaño en el panel derecho
  const ro = new ResizeObserver(() => recalcListMax());
  if (detalleRef.current) ro.observe(detalleRef.current);

  // re-calcula en resize de ventana
  window.addEventListener('resize', recalcListMax);

  return () => {
    window.removeEventListener('resize', recalcListMax);
    ro.disconnect();
  };
}, [recalcListMax]);

// recalcular también cuando cambian cosas que mueven el layout izquierdo
useEffect(() => {
  recalcListMax();
}, [leftMode, toggleVisible, isFading, equiposFiltrados.length, mostrarForm, equipoSeleccionado, recalcListMax]);



  return (
    <div className="mainContainer container p-4">
      <h2 className="mb-2 Titulo text-center">
        {ROLE === 'null' ? 'DOCUMENTACIÓN TÉCNICA' : 'CONFIGURACIÓN SWBS'}
      </h2>

      {vista === 'buques' && ROLE === 'superuser' && (
        <div id="buquesContainer" className="row gx-3 gy-4 justify-content-start">
          {renderCardsBuques()}
        </div>
      )}

      {vista === 'swbs' && (
        <div id="contenedorRondas">
          {/* barra superior */}
          <div className="d-flex justify-content-between mb-3">
            <div className="d-flex align-items-end">
              {ROLE === 'superuser' ? (
                <>
                  <h3 className="Titulo me-3">Buque:</h3>
                  <select
                    className="form-select me-3"
                    value={buqueSeleccionado || ''}
                    onChange={(e) => {
                      const newId = parseInt(e.target.value, 10);
                      const found = buques.find((b) => b.id === newId) || {};
                      const nombre = found.nombre || 'Sin selección';
                      setBuqueSeleccionado(newId);
                      setBuqueNombre(nombre);
                      localStorage.setItem('buqueSeleccionado', String(newId));
                      localStorage.setItem('buqueNombre', nombre);
                      // reset
                      setLeftMode('grupos');
                      setToggleVisible(false);
                      setIsFading(false);
                      setFadingMode(null);
                      setGrupoSeleccionado(null);
                      setEquipoSeleccionado(null);
                      setMostrarForm(false);
                      setEquipos([]);
                      setFiltros({ sistema: '', subsistema: '', nombre: '' });
                      setSistemasMap({});
                      setSubsistemasMap({});
                    }}
                  >
                    <option value="" disabled>Seleccione un buque…</option>
                    {buques.map((b) => (
                      <option key={b.id} value={b.id}>{b.nombre}</option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <span className="Titulo me-3">{buqueNombre}</span>
                  {ROLE === 'admin' && buqueSeleccionado && (
                    <button className="btn btn-outline-primary btn-sm me-3" onClick={() => editarBuque(buqueSeleccionado)}>
                      Ver / Editar buque
                    </button>
                  )}
                  {ROLE === 'null' && buqueSeleccionado && (
                    <button className="btn btn-outline-secondary btn-sm me-3" onClick={() => editarBuque(buqueSeleccionado)}>
                      Ver buque
                    </button>
                  )}
                </>
              )}
            </div>
            {ROLE === 'superuser' && (
              <button className="btn btn-azul" onClick={handleVolver}>Volver</button>
            )}
          </div>

          {(ROLE === 'admin' || ROLE === 'null') && !buqueSeleccionado && (
            <div className="alert alert-warning">
              Este usuario no tiene un buque asignado. Solicite a un superuser la asignación para operar en SWBS.
            </div>
          )}

          {/* Layout principal */}
          <div className="row">
            {/* Columna IZQUIERDA con swap interno */}
            <div className="col-12 col-lg-4 mb-3">
              <div
                className={
                  `left-swapper ${leftMode}` +
                  (isFading && fadingMode ? ` fading-${fadingMode}` : '')
                }
              >
                {/* Toggle bar */}
                {toggleVisible && (
                  <button
                    className={`toggle-bar ${leftMode === 'grupos' ? 'bar-on-right' : 'bar-on-left'}`}
                    title={leftMode === 'grupos' ? 'Ver Equipos' : 'Ver Grupos'}
                    onClick={() => {
                      setMostrarForm(false);
                      swapLeftMode(leftMode === 'grupos' ? 'equipos' : 'grupos');
                    }}
                  >
                    <span className="toggle-text">
                      {leftMode === 'grupos' ? 'EQUIPOS' : 'GRUPOS'}
                    </span>

                    {leftMode === 'grupos' ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor"
                           className="bi bi-chevron-left" viewBox="0 0 16 16">
                        <path fillRule="evenodd"
                              d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0"/>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor"
                           className="bi bi-chevron-right" viewBox="0 0 16 16">
                        <path fillRule="evenodd"
                              d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708"/>
                      </svg>
                    )}
                  </button>
                )}

                {/* Pista con ambos paneles */}
                <div className="swap-track">
                  {renderPanelGrupos()}
                  {renderPanelEquipos()}
                </div>
              </div>
            </div>

            {/* Columna DERECHA (detalle) */}
            <div className="col-12 col-lg-8">
              <div id="detalle-equipo-container" className="detalle-panel rounded" ref={detalleRef}>
                {mostrarForm ? (
                  <EquipoForm
                    embedded
                    equipoIdProp={equipoSeleccionado?.id ?? null}
                    buqueIdProp={buqueSeleccionado}
                    onSaved={onSavedEquipo}
                    onDeleted={onDeletedEquipo}   // <--- NUEVO
                    onCancel={onCancelEquipo}
                    onFormDataChange={setFormData}
                    onDocumentSelected={setSelectedDocument}
                  />
                ) : (
                  <div className="detalle-placeholder text-center text-muted align-content-center p-5">
                    <p>Selecciona un equipo o crea uno nuevo para verlo/editarlo aquí.</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}


    </div>
  );
}
