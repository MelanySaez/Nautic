import React, { useState, useEffect, useMemo, useRef } from 'react';
import './desglose.css';
import './GestionEquipos.css';
import './Rondas-iOS-Subtle.css';
import { API_BASE } from '../config';
import ReactDOM from 'react-dom/client';
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css'
import api from '../services/api';

const LANG_KEY = 'app_lang';
const i18n = {
  es: {
    maintenanceRounds: 'RONDAS DE MANTENIMIENTO',
    selectShip: 'SELECCIONE UN BUQUE',
    ship: 'Buque',
    propulsionPlant: 'Planta Propulsora',
    electricPlant: 'Planta Eléctrica',
    auxiliarySystems: 'Sistemas Auxiliares',
    hullStructures: 'Cascos y Estructuras',
    commandSurveillance: 'Comando y Vigilancia',
    finishingFurnishing: 'Acabados y Amoblamiento',
    weapons: 'Armamento',
    allSubgroups: 'Todos los subgrupos',
    allSystems: 'Todos los sistemas',
    allSubsystems: 'Todos los subsistemas',
    searchByName: 'Buscar por Nombre',
    noShips: 'No hay buques registrados.',
    noEquipments: 'No hay equipos disponibles para este grupo.',
    scanQR: 'Escanear QR', 
    blockedTitle: 'Ronda no disponible',
    willOpenIn: 'La ronda se podrá realizar en',
    endsIn: 'La ventana termina en',
    nextRoundMsg: 'No se puede realizar la ronda ahora. La siguiente ronda estará disponible en',
    roundDone: 'Ronda realizada',
  },
  en: {
    maintenanceRounds: 'MAINTENANCE ROUNDS',
    selectShip: 'SELECT A SHIP',
    ship: 'Ship',
    propulsionPlant: 'Propulsion Plant',
    electricPlant: 'Electric Plant',
    auxiliarySystems: 'Auxiliary Systems',
    hullStructures: 'Hull and Structures',
    commandSurveillance: 'Command and Surveillance',
    finishingFurnishing: 'Finishing and Furnishing',
    weapons: 'Weapons',
    allSubgroups: 'All subgroups',
    allSystems: 'All systems',
    allSubsystems: 'All subsystems',
    searchByName: 'Search by Name',
    noShips: 'No ships registered.',
    noEquipments: 'No equipment available for this group.',
    scanQR: 'Scan QR', 
    blockedTitle: 'Round unavailable',
    willOpenIn: 'The round will be available in',
    endsIn: 'Window ends in',
    nextRoundMsg: 'You can’t start a round now. The next round will be available in',
    roundDone: 'Round done',
  }
};

function loadLang() {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === 'es' || saved === 'en') return saved;
  const nav = (navigator.language || 'es').toLowerCase();
  return nav.startsWith('en') ? 'en' : 'es';
}

function formatHMS(totalSec) {
  if (totalSec == null) return '--:--:--';
  const s = Math.max(0, totalSec);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  return `${hh.toString().padStart(2,'0')}:${mm.toString().padStart(2,'0')}:${ss.toString().padStart(2,'0')}`;
}

const SS_KEYS = {
  buqueId: 'rondas_buque_id',
  buqueNombre: 'rondas_buque_nombre',
  grupo: 'rondas_grupo',
  filtros: 'rondas_filtros',
  lastEquipo: 'rondas_last_equipo', // opcional: para volver al mismo equipo en el grid
};


const Rondas = () => {
  const authUser = null; // Sin autenticación en versión lite
  const role = null;
  const IS_USER = false;
  const IS_SUPERUSER = true; // En versión lite, comportamiento como superuser (puede seleccionar buque)
  const IS_ADMIN = false;

  const [lang, setLang] = useState(loadLang);
  const t = useMemo(() => i18n[lang] ?? i18n.es, [lang]);
  useEffect(() => {
    const handler = (e) => setLang(e.detail.lang);
    window.addEventListener('app:language', handler);
    return () => window.removeEventListener('app:language', handler);
  }, []);

  // --- Buques ---
  const [buques, setBuques] = useState([]);
  const [buqueSeleccionado, setBuqueSeleccionado] = useState(() => {
    const saved = sessionStorage.getItem(SS_KEYS.buqueId);
    return saved ? Number(saved) : null;
  });
  const [buqueNombre, setBuqueNombre] = useState(() => (
    sessionStorage.getItem(SS_KEYS.buqueNombre) || 'Sin selección'
  ));

  // --- Estado de ventana ---
  const [estadoRonda, setEstadoRonda] = useState(null);
  const [countdownOpen, setCountdownOpen] = useState(null);
  const [countdownClose, setCountdownClose] = useState(null);
  const pollRef = useRef(null);

  // --- Jerarquía y equipos ---
  const [grupoSeleccionado, setGrupoSeleccionado] = useState(() => {
    const saved = sessionStorage.getItem(SS_KEYS.grupo);
    return saved ? Number(saved) : null;
  });
  const [gruposConstructivos, setGruposConstructivos] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [equiposDone, setEquiposDone] = useState({}); // mapa {equipoId: true} para equipos con ronda ya realizada
  const [equiposStatusLoading, setEquiposStatusLoading] = useState(false);
  const [subgrupos, setSubgrupos] = useState([]);
  const [sistemas, setSistemas] = useState([]);
  const [subsistemas, setSubsistemas] = useState([]);
  const [filtros, setFiltros] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(SS_KEYS.filtros)) || {
        subgrupo: '', sistema: '', subsistema: '', nombre: ''
      };
    } catch {
      return { subgrupo: '', sistema: '', subsistema: '', nombre: '' };
    }
  });

  // Only show rondas if user or admin (with assigned buque), or superuser with selected buque
  const SHOW_RONDAS = IS_USER || IS_ADMIN || (!!buqueSeleccionado); // superuser necesita seleccionar; admin/user siempre que tengan buque

  // Forzar asignación fija para admin/user cuando llegue el contexto (evita que vean selector residual)
  useEffect(() => {
    if ((IS_USER || IS_ADMIN) && authUser?.buque_id) {
      setBuqueSeleccionado(prev => prev === authUser.buque_id ? prev : authUser.buque_id);
      setBuqueNombre(authUser?.buque_nombre || buqueNombre || 'Sin selección');
      // limpiar cualquier residuo de selección previa de superuser
      sessionStorage.removeItem(SS_KEYS.buqueId);
      sessionStorage.removeItem(SS_KEYS.buqueNombre);
    }
  }, [IS_USER, IS_ADMIN, authUser?.buque_id, authUser?.buque_nombre]);

  // Si admin/user sin buque asignado: no permitir selección (bloqueado) y mostrar aviso
  const needsAssignment = (IS_USER || IS_ADMIN) && !authUser?.buque_id;

  // nombre del buque del usuario o admin
  useEffect(() => {
    if ((IS_USER || IS_ADMIN) && authUser?.buque_id) {
      api.get(`/buque/${authUser.buque_id}/nombre/`)
          .then(({ data }) => { if (data?.nombre) setBuqueNombre(data.nombre); })
          .catch(() => {});
    }
  }, [IS_USER, IS_ADMIN, authUser?.buque_id]);

  // cargar buques (rol admin)
    useEffect(() => {
      if (IS_SUPERUSER) {
        setBuqueSeleccionado(null);
        setBuqueNombre('Sin selección');
        api.get(`/buques/`).then(({ data }) => setBuques(data))
          .catch(err => console.error('❌ Error al cargar buques:', err));
        }
    }, [IS_SUPERUSER]);

  // animación de entrada
  useEffect(() => {
    if (IS_SUPERUSER && buqueSeleccionado) {
      const contenedor = document.getElementById('contenedorRondas');
      if (contenedor) {
        contenedor.classList.remove('fade-in');
        void contenedor.offsetWidth;
        contenedor.classList.add('fade-in');
      }
    }
  }, [buqueSeleccionado, IS_SUPERUSER]);

  // === Polling de estado de ventana ===
  useEffect(() => {
    if (!SHOW_RONDAS) return;

    const fetchEstado = () => {
      const params = new URLSearchParams();
  const buqueId = IS_USER ? authUser?.buque_id : buqueSeleccionado;
      if (!buqueId) return;

      params.set('buque_id', buqueId);
      // si luego necesitas por equipo, agrega ?equipo_id=...
      api.get(`/rondas/estado/?${params.toString()}`)
        .then(({ data }) => {setEstadoRonda(data);
          setCountdownOpen(data?.remaining_to_open_sec ?? null);
          setCountdownClose(data?.remaining_to_close_sec ?? null);
        })
        .catch(() => {});
    };

    fetchEstado();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      setCountdownOpen(c => (c != null ? Math.max(0, c - 1) : null));
      setCountdownClose(c => (c != null ? Math.max(0, c - 1) : null));
    }, 1000);

    const refreshTimer = setInterval(fetchEstado, 15000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      clearInterval(refreshTimer);
    };
  }, [SHOW_RONDAS, IS_USER, buqueSeleccionado]);

  // persistir buque
  useEffect(() => {
    if (IS_SUPERUSER) {
      if (buqueSeleccionado != null) sessionStorage.setItem(SS_KEYS.buqueId, String(buqueSeleccionado));
      if (buqueNombre) sessionStorage.setItem(SS_KEYS.buqueNombre, buqueNombre);
    }
  }, [IS_SUPERUSER, buqueSeleccionado, buqueNombre]);

  // persistir grupo
  useEffect(() => {
    if (grupoSeleccionado != null) {
      sessionStorage.setItem(SS_KEYS.grupo, String(grupoSeleccionado));
    }
  }, [grupoSeleccionado]);

  // persistir filtros
  useEffect(() => {
    sessionStorage.setItem(SS_KEYS.filtros, JSON.stringify(filtros));
  }, [filtros]);

  // Cargar grupos constructivos cuando cambie el buque
  useEffect(() => {
    if (SHOW_RONDAS) {
      cargarGruposConstructivos();
    }
  }, [SHOW_RONDAS, IS_USER, IS_ADMIN, authUser?.buque_id, buqueSeleccionado]);


  const seleccionarBuque = (id, nombre) => {
    const buquesContainer = document.getElementById('buquesContainer');
    const titulo = document.getElementById('tituloSeleccionBuque');

    const doSet = () => {
      // Estado en memoria
      setBuqueSeleccionado(id);
      setBuqueNombre(nombre);

      // Persistencia (compatibilidad con tus claves actuales y nuevas claves sugeridas)
      sessionStorage.setItem('buqueSeleccionado', String(id));
      sessionStorage.setItem('buqueNombre', nombre);
      sessionStorage.setItem('rondas_buque_id', String(id));
      sessionStorage.setItem('rondas_buque_nombre', nombre);

      // Reset de selección de jerarquía y filtros
      setGrupoSeleccionado(null);
      setFiltros({ subgrupo: '', sistema: '', subsistema: '', nombre: '' });

      // Limpiar persistencia de jerarquía/filtros
      sessionStorage.removeItem('rondas_grupo');
      sessionStorage.removeItem('rondas_filtros');

      // Limpiar data cargada
      setEquipos([]);
      setSubgrupos([]);
      setSistemas([]);
      setSubsistemas([]);
    };

    if (IS_SUPERUSER && buquesContainer && titulo) {
      buquesContainer.classList.add('fade-out');
      titulo.classList.add('fade-out');
      buquesContainer.addEventListener('animationend', doSet, { once: true });
      return;
    }
    doSet();
  };


  const renderBuques = () => {
    if (!buques.length) {
      return <p className="text-center text-muted">{t.noShips}</p>;
    }
    return buques.map(b => {
      const imagenUrl = b.imagen || '/static/img/default_image.png';
      return (
        <div key={b.id} className="col-12 col-sm-6 col-md-4 col-lg-3 mb-4">
          <div className="card buque-card" onClick={() => seleccionarBuque(b.id, b.nombre)}>
            <span className="buque-etapa">{b.etapa}</span>
            <img src={imagenUrl} className="card-img-top" alt={b.nombre}
                 loading="lazy"
                 onError={(e)=>{ e.currentTarget.src='/static/img/default_image.png'; }} />
            <div className="card-body">
              <h5 className="card-title">{b.nombre}</h5>
              <p className="card-text">
                {b.descripcion?.length > 80 ? b.descripcion.substring(0, 80) + '...' : b.descripcion}
              </p>
            </div>
          </div>
        </div>
      );
    });
  };

  // Normaliza valores de los selects numéricos para que coincidan con los IDs (números) de los equipos
  const handleFiltroChange = (e) => {
    const { name, value } = e.target;
    let parsed = value;
    if (["subgrupo", "sistema", "subsistema"].includes(name)) {
      parsed = value ? Number(value) : ""; // Guardamos número (o string vacío para "todos")
    }
    setFiltros({ ...filtros, [name]: parsed });
  };

  // Función para obtener el nombre del grupo según su número
  const getGrupoName = (grupoNumero) => {
    const grupoMap = {
      100: t.hullStructures,
      200: t.propulsionPlant,
      300: t.electricPlant,
      400: t.commandSurveillance,
      500: t.auxiliarySystems,
      600: t.finishingFurnishing,
      700: t.weapons
    };
    return grupoMap[grupoNumero] || `Grupo ${grupoNumero}`;
  };

  // Función para cargar los grupos constructivos del buque
  const cargarGruposConstructivos = async () => {
    const buqueId = IS_USER || IS_ADMIN ? authUser?.buque_id : buqueSeleccionado;
    if (!buqueId) return;

    try {
      // Primero obtener todos los grupos disponibles desde /grupos/
      const { data: todosLosGrupos } = await api.get('/grupos/');
      console.log('Todos los grupos disponibles:', todosLosGrupos); // Debug
      
      // Luego obtener la configuración del buque
      const { data: buqueData } = await api.get(`/buque/${buqueId}/`);
      console.log('Datos del buque:', buqueData); // Debug
      console.log('Grupos constructivos configurados:', buqueData.grupos_constructivos); // Debug
      
      const gruposConfiguracion = buqueData.grupos_constructivos || [];
      
      let gruposActivos;
      if (Array.isArray(gruposConfiguracion) && gruposConfiguracion.length > 0) {
        // Usar la configuración del buque, pero obtener los IDs reales desde la API de grupos
        gruposActivos = gruposConfiguracion
          .filter(g => g.activo)
          .map(g => {
            const numero = parseInt(g.ref); // ref como "200", "300", etc.
            // Buscar el grupo real en la API para obtener su ID de DB
            const grupoReal = todosLosGrupos.find(gr => gr.numero_de_referencia === numero);
            
            if (!grupoReal) {
              console.warn(`Grupo con referencia ${numero} no encontrado en la DB`);
              return null;
            }
            
            return {
              id: grupoReal.id, // ID real de la base de datos
              numero: numero, // El número de referencia (200, 300, etc.)
              img: `/${numero === 100 ? '1' : String(numero)[0]}.png`,
              label: getGrupoName(numero),
              ref: String(numero)
            };
          })
          .filter(Boolean); // Remover nulls
      } else {
        // Fallback: usar grupos por defecto pero con IDs reales
        const numerosDefault = [200, 300, 500];
        gruposActivos = numerosDefault
          .map(numero => {
            const grupoReal = todosLosGrupos.find(gr => gr.numero_de_referencia === numero);
            if (!grupoReal) {
              console.warn(`Grupo por defecto con referencia ${numero} no encontrado en la DB`);
              return null;
            }
            return {
              id: grupoReal.id, // ID real de la base de datos
              numero: numero,
              img: `/${String(numero)[0]}.png`,
              label: getGrupoName(numero),
              ref: String(numero)
            };
          })
          .filter(Boolean);
      }
      
      console.log('Grupos activos procesados:', gruposActivos); // Debug
      setGruposConstructivos(gruposActivos);
    } catch (error) {
      console.error('Error al cargar grupos constructivos:', error);
      // Fallback básico (esto probablemente no funcionará bien sin IDs reales)
      const gruposDefault = [200, 300, 500].map(numero => ({
        id: numero, // Esto podría estar mal, pero es un fallback de emergencia
        numero: numero,
        img: `/${String(numero)[0]}.png`,
        label: getGrupoName(numero),
        ref: String(numero)
      }));
      setGruposConstructivos(gruposDefault);
    }
  };

  const seleccionarGrupo = (grupoId) => {
    setGrupoSeleccionado(grupoId);
    setFiltros({ subgrupo: '', sistema: '', subsistema: '', nombre: '' });
  };

  // cargar equipos + subgrupos
  useEffect(() => {
    if (!grupoSeleccionado) return;
    if (!IS_USER && !IS_ADMIN && !buqueSeleccionado) return;

    const buqueId = IS_USER || IS_ADMIN ? authUser?.buque_id : buqueSeleccionado;
    if (!buqueId) return;

    // Buscar el grupo seleccionado en gruposConstructivos para obtener el ID correcto
    const grupoObj = gruposConstructivos.find(g => g.numero === grupoSeleccionado);
    if (!grupoObj) {
      console.error('Grupo no encontrado en gruposConstructivos:', grupoSeleccionado);
      return;
    }

    const params = new URLSearchParams();
    // Usar el ID real del grupo, no el número de referencia
    params.set('grupo_id', grupoObj.id);
    params.set('buque_id', buqueId);

    console.log('Cargando equipos con params:', params.toString()); // Debug
    console.log('Grupo objeto encontrado:', grupoObj); // Debug

    // Equipos
    api.get(`/equipos/?${params.toString()}`)
      .then(({ data }) => {
        console.log('Respuesta equipos:', data); // Debug
        if (Array.isArray(data)) {
          setEquipos(data);
          fetchEquiposDoneBatch(data);
        } else if (data && Array.isArray(data.results)) {
          setEquipos(data.results);
          fetchEquiposDoneBatch(data.results);
        } else {
          setEquipos([]);
        }
      })
      .catch(err => {
        setEquipos([]);
        console.error('Error al cargar equipos:', err);
      });

    // Subgrupos - usar también el ID real del grupo
    api.post(`/subgrupos/`, { grupo_id: grupoObj.id })
      .then(({ data }) => {
        setSubgrupos(Array.isArray(data) ? data : []);
      })
      .catch(err => {
        setSubgrupos([]);
        console.error('Error al cargar subgrupos:', err);
      });

    // Al cambiar de grupo, resetea sistemas/subsistemas
    setSistemas([]);
    setSubsistemas([]);
  }, [grupoSeleccionado, IS_USER, IS_ADMIN, authUser?.buque_id, buqueSeleccionado, gruposConstructivos]);


  useEffect(() => {
    if (!filtros.subgrupo) {
      setSistemas([]);
      return;
    }
    api.post(`/sistemas/`, { subgrupo_id: filtros.subgrupo })
      .then(({ data }) => {
        setSistemas(Array.isArray(data) ? data : []);
      })
      .catch(err => {
        setSistemas([]);
        console.error('Error al cargar sistemas:', err);
      });
  }, [filtros.subgrupo]);


  useEffect(() => {
    if (!filtros.sistema) {
      setSubsistemas([]);
      return;
    }
    api.post(`/subsistemas/`, { sistema_id: filtros.sistema })
      .then(({ data }) => {
        setSubsistemas(Array.isArray(data) ? data : []);
      })
      .catch(err => {
        setSubsistemas([]);
        console.error('Error al cargar subsistemas:', err);
      });
  }, [filtros.sistema]);

  // Nueva versión: batch endpoint único
  const fetchEquiposDoneBatch = (listaEquipos) => {
    if (!Array.isArray(listaEquipos) || !listaEquipos.length) {
      setEquiposDone({});
      return;
    }
    const buqueId = IS_USER ? authUser?.buque_id : buqueSeleccionado;
    if (!buqueId) return;
    const ids = listaEquipos.map(e => e.id).join(',');
    setEquiposStatusLoading(true);
    api.get(`/rondas/estado-multiple/?buque_id=${buqueId}&equipos=${ids}`)
      .then(({ data }) => {
        const map = {};
        if (data?.results) {
          data.results.forEach(r => { if (r.already_done) map[r.equipo_id] = true; });
        }
        setEquiposDone(map);
      })
      .catch(() => { setEquiposDone({}); })
      .finally(() => setEquiposStatusLoading(false));
  };


  const equiposFiltrados = equipos.filter(e => {
    // Nos aseguramos de comparar números con números
    const coincideSubgrupo = filtros.subgrupo ? e.subgrupo_id === Number(filtros.subgrupo) : true;
    const coincideSistema  = filtros.sistema  ? e.sistema_id === Number(filtros.sistema) : true;
    const coincideSubsist  = filtros.subsistema ? e.subsistema_id === Number(filtros.subsistema) : true;
    const coincideNombre   = filtros.nombre
      ? (e.nombre_equipo || '').toLowerCase().includes(filtros.nombre.toLowerCase())
      : true;
    return coincideSubgrupo && coincideSistema && coincideSubsist && coincideNombre;
  }).sort((a, b) => {
    // Ordenar por código CJ - números primero, luego alfanuméricos
    const codigoA = a.codigo_cj || a.cj || a.referencia || '';
    const codigoB = b.codigo_cj || b.cj || b.referencia || '';
    
    // Verificar si los códigos son puramente numéricos
    const esNumericoA = /^\d+$/.test(codigoA);
    const esNumericoB = /^\d+$/.test(codigoB);
    
    // Si uno es numérico y el otro no, el numérico va primero
    if (esNumericoA && !esNumericoB) return -1;
    if (!esNumericoA && esNumericoB) return 1;
    
    // Si ambos son numéricos, comparar como números
    if (esNumericoA && esNumericoB) {
      return Number(codigoA) - Number(codigoB);
    }
    
    // Si ambos son alfanuméricos, usar comparación alfanumérica
    return codigoA.localeCompare(codigoB, undefined, { numeric: true, sensitivity: 'base' });
  });


  const allowedNow = !!estadoRonda?.allowed_now;

  const handleOpenRonda = (equipoId) => {
    // Solo verificar ventana abierta, permitir editar rondas ya realizadas en ventana actual
    if (!allowedNow) return;
    sessionStorage.setItem(SS_KEYS.lastEquipo, String(equipoId)); // opcional
    window.location.href = `/ronda/${equipoId}`;
  };

  // Calcular clases CSS responsivas para grupos dinámicos
  // We won't rely on bootstrap column wrappers for grupo cards.
  // Instead we'll compute a per-card width (percentage) and apply it
  // inline to each `.card.grupo-card`. Keep this helper for
  // backward-compatibility if needed elsewhere.
  const getResponsiveClasses = (totalGroups) => {
    if (totalGroups <= 1) return 'p-0';
    if (totalGroups === 2) return 'p-0';
    if (totalGroups === 3) return 'p-0';
    if (totalGroups === 4) return 'p-0';
    return 'p-0';
  };

  const dynamicStyles = `
    /* Use a CSS variable for the gap between cards. We'll compute widths with calc so
       total cards + gaps never overflow 100% */
    :root { --grupo-gap-px: 12px; }
    #grupoContainer { display: flex; flex-wrap: wrap; gap: var(--grupo-gap-px); }
    /* Ensure grupo-card behaves well when width is applied inline */
    .grupo-card {
      box-sizing: border-box;
      margin: 0; /* spacing controlled by container */
    }
    .grupo-card.con-imagen {
      height: 200px;
    }
  `;

// Calcula una escala de 1.0 (<=4 grupos) bajando a 0.9 (5), 0.85 (6), 0.8 (7), 0.75 (8+)
const groupCount = gruposConstructivos.length || 0;
const computeScale = (n) => {
  if (n <= 4) return 1;
  if (n === 5) return 0.9;
  if (n === 6) return 0.85;
  if (n === 7) return 0.8;
  return 0.75; // 8 o más
};

// Responsive: adjust scale slightly based on viewport width so cards look good on mobiles
const [viewportWidth, setViewportWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
useEffect(() => {
  if (typeof window === 'undefined') return;
  const onResize = () => setViewportWidth(window.innerWidth);
  window.addEventListener('resize', onResize);
  return () => window.removeEventListener('resize', onResize);
}, []);

// viewport factor (smaller on very small screens)
const viewportFactor = viewportWidth < 480 ? 0.78 : (viewportWidth < 768 ? 0.9 : (viewportWidth < 992 ? 0.95 : 1));
const baseScale = computeScale(groupCount);
const grupoScale = Number((baseScale * viewportFactor).toFixed(3));

// gap between cards responsive
const gapPx = viewportWidth < 480 ? 8 : (viewportWidth < 768 ? 10 : 12);

// Ensure CSS variables are available globally (some tools/readers may check :root)
useEffect(() => {
  try {
    const root = document && document.documentElement;
    if (root && root.style) {
      root.style.setProperty('--grupo-scale', String(grupoScale));
      root.style.setProperty('--grupo-gap-px', `${gapPx}px`);
    }
  } catch (e) {}
}, [grupoScale, gapPx]);

  return (
    <>
      <style>{dynamicStyles}</style>
    <div className="container mt-3 position-relative">
      {(IS_USER || IS_ADMIN) && !needsAssignment && (
        <div className="p-3">
          <div>
            <h2 className="Titulo mb-0">{t.maintenanceRounds}</h2>
            <h3 className="Subtitulo">
              {t.ship} <span id="buqueNombre" style={{ color: '#1976d2', fontWeight: 'bold' }}>{buqueNombre}</span>
            </h3>
          </div>
        </div>
        )}
  
      {needsAssignment && (
        <div className="alert alert-warning mt-3">
          Este usuario no tiene un buque asignado. Solicite a un superuser la asignación para continuar.
        </div>
      )}

      {/* Only show buque selection/cards for superuser */}
      {!SHOW_RONDAS && IS_SUPERUSER && !needsAssignment && (
        <>
          <h2 id="tituloSeleccionBuque" className="mb-4 Titulo text-center">{t.selectShip}</h2>

          <div id="buquesContainer" className="row justify-content-center">
            {renderBuques()}
          </div>
        </>
      )}

      {SHOW_RONDAS && (
        // contenedor general
        <div id="contenedorRondas" className="fade-in" style={{ position: 'relative' }}>
          {/* Only show buque dropdown for superuser */}
          {IS_SUPERUSER && !needsAssignment && (
            <div className="d-flex justify-content-between mb-3">
              <div className="d-flex align-items-end">
                <h5 className="Titulo me-3">{t.ship}:</h5>
                <select
                  className="form-select"
                  style={{ width: 280 }}
                  value={buqueSeleccionado || ''}
                  onChange={e => {
                    const newId = parseInt(e.target.value, 10);
                    const nombre = buques.find(b => b.id === newId)?.nombre || 'Sin selección';
                    seleccionarBuque(newId, nombre);
                  }}
                >
                  {buques.map(b => (
                    <option key={b.id} value={b.id}>{b.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* 🔒 Solo lo de abajo se bloquea/borrosa */}
          <div id="bloqueable" style={{ position: 'relative' }}>
            {/* === MODAL centrado dentro de "bloqueable" (NO tapa el selector) === */}
            {!allowedNow && estadoRonda && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,                    // cubre solo "bloqueable"
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 40,
                  pointerEvents: 'auto'
                }}
              >
                <div
                  style={{
                    background: '#fff',
                    borderRadius: '8px',
                    padding: '1rem',
                    maxWidth: '800px',
                    width: '100%',
                    textAlign: 'center',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
                  }}
                >
                  <h3 className="mb-1" style={{ color: '#333' }}>
                    {t.blockedTitle}
                  </h3>

                  <p className="h6 mb-1" style={{ color: '#555' }}>
                    {t.nextRoundMsg} <strong>{formatHMS(countdownOpen)}</strong>
                  </p>

                  {estadoRonda?.reason && (
                    <small className="d-block mb-2" style={{ color: '#777' }}>
                      {estadoRonda.reason}
                    </small>
                  )}

                  {estadoRonda?.next_start && (
                    <small style={{ color: '#999' }}>
                      Próxima ventana: {new Date(estadoRonda.next_start).toLocaleString()}
                    </small>
                  )}
                </div>
              </div>
            )}

            {/* Barra info cuando está permitido */}
            {allowedNow && estadoRonda && (
              <div className="alert alert-success d-flex justify-content-between align-items-center py-2">
                <div><strong>Ventana activa.</strong></div>
                {countdownClose != null && (
                  <div>{t.endsIn}: <strong>{formatHMS(countdownClose)}</strong></div>
                )}
              </div>
            )}

            {/* Contenido bloqueable: se difumina y desactiva cuando no hay ventana */}
            <div
              style={{
                filter: allowedNow ? 'none' : 'blur(5px)',
                pointerEvents: allowedNow ? 'auto' : 'none'
              }}
              aria-hidden={!allowedNow}
            >
              <div id="grupoFiltrosContainer" className={`container-fluid p-3 ${grupoSeleccionado ? 'contraido' : ''}`}>
                <div
                  id="grupoContainer"
                  className={`row  ${grupoSeleccionado ? 'contraido' : ''}`}
                  style={{
                    // expose CSS variables used by desglose.css
                    ['--grupo-scale']: String(grupoScale),
                    // we'll possibly use a slightly smaller gap when many groups so items fit
                    ['--grupo-gap-px']: `${Math.max(6, gapPx - (groupCount > 5 ? 4 : 0))}px`
                  }}
                >
                  {gruposConstructivos.map(g => {
                    const n = Math.max(1, groupCount);
                    // Total gap space between n cards in one row is (n - 1) * gapPx
                    // If many groups, reduce the effective gap slightly to help fitting
                    const effectiveGap = groupCount > 5 ? Math.max(6, gapPx - 4) : gapPx;
                    const totalGapPx = (n - 1) * effectiveGap;
                    // Use CSS calc to compute percentage: (100% - totalGapPxpx) / n
                    const widthCalc = `calc((100% - ${totalGapPx}px) / ${n})`;
                    const minWpx = viewportWidth < 480 ? 72 : (viewportWidth < 768 ? 84 : 100);

                    // If any grupo is selected, the layout is "contraido" (contracted)
                    // In that state we do NOT render the image and the card is much shorter.
                    const isContracted = !!grupoSeleccionado;

                    // Apply inline sizes derived from grupoScale so CSS doesn't need var(--grupo-scale)
                    const cardWidth = widthCalc; // percentage-based calc
                    const cardHeightPx = isContracted ? Math.round(64 * grupoScale) : Math.round(200 * grupoScale);
                    const imgHeightPx = isContracted ? 0 : Math.round(150 * grupoScale);
                    const overlayFontPx = isContracted ? Math.round(18 * grupoScale) : Math.round(32 * grupoScale);
                    // Reserve a fixed label block so cards keep uniform white-space area.
                    // For contracted mode we'll clamp to exactly 2 lines.
                    const labelFontPx = isContracted ? Math.max(10, Math.round(12 * grupoScale)) : undefined;
                    const labelLineHeightPx = labelFontPx ? Math.max(12, Math.round(labelFontPx * 1.15)) : 18;
                    const labelHeightPx = isContracted
                      ? (labelLineHeightPx * 2) + 4 // two lines + small padding
                      : Math.max(36, cardHeightPx - imgHeightPx);
                    const cardStyle = {
                      flex: `0 0 ${cardWidth}`,
                      maxWidth: cardWidth,
                      boxSizing: 'border-box',
                      padding: 0,
                      minWidth: `${minWpx}px`,
                      height: `${cardHeightPx}px`,
                      position: 'relative', // so overlay absolute works when not contracted
                      display: 'flex',
                      // When contracted, avoid forcing column layout which can cause label overflow
                      ...(isContracted
                        ? { alignItems: 'center', justifyContent: 'center' }
                        : { flexDirection: 'column', justifyContent: 'flex-start' }
                      )
                    };

                    return (
                      <div key={g.id}
                        className={`card grupo-card ${grupoSeleccionado === g.numero ? 'seleccionado' : ''} ${isContracted ? 'contraido solo-texto' : 'con-imagen'}`}
                        data-grupo-id={g.numero}
                        onClick={() => seleccionarGrupo(g.numero)}
                        style={cardStyle}
                      >
                        {!isContracted && (
                          <img src={g.img} alt={g.label} style={{ height: `${imgHeightPx}px`, objectFit: 'cover', width: '100%' }} />
                        )}
                        {/* Overlay: when contracted render as a single-line block above the label; otherwise keep original absolute overlay */}
                        <div
                          className="overlay-text"
                          style={isContracted ? {
                            fontSize: `${overlayFontPx}px`,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: 'block',
                            width: '100%',
                            textAlign: 'center',
                            margin: '2px 0',
                            padding: 0,
                            boxSizing: 'border-box'
                          } : {
                            fontSize: `${overlayFontPx}px`,
                            left: `${Math.max(6, Math.round(10 * grupoScale))}px`,
                            top: undefined
                          }}
                        >
                          {g.ref}
                        </div>

                        {/* Fixed-height label area so all cards align visually. In contracted mode clamp to 2 lines. */}
                        <div style={{ height: `${labelHeightPx}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', boxSizing: 'border-box', overflow: 'hidden' }}>
                          <p
                            className="grupo"
                            style={{
                              margin: 0,
                              textAlign: 'center',
                              width: '100%',
                              whiteSpace: 'normal',
                              overflowWrap: 'break-word',
                              fontSize: labelFontPx ? `${labelFontPx}px` : undefined,
                              lineHeight: `${labelLineHeightPx}px`,
                              maxHeight: `${labelHeightPx}px`,
                              overflow: 'hidden',
                              display: isContracted ? '-webkit-box' : undefined,
                              WebkitLineClamp: isContracted ? 2 : undefined,
                              WebkitBoxOrient: isContracted ? 'vertical' : undefined,
                              textOverflow: isContracted ? 'ellipsis' : undefined,
                              wordBreak: 'break-word'
                            }}
                          >
                            {g.label}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {grupoSeleccionado && (
                  <div id="barraFiltros" className="row mt-3 mostrar">
                    <div className="col-md-3">
                      <select
                        id="filtroSubgrupo"
                        className="form-select"
                        name="subgrupo"
                        value={filtros.subgrupo}
                        onChange={handleFiltroChange}
                        disabled={!(subgrupos && subgrupos.length)}
                      >
                        <option value="">{t.allSubgroups}</option>
                        {subgrupos.map(sg => (
                          <option key={sg.id} value={sg.id}>
                            {sg.numero_de_referencia} - {sg.descripcion}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-md-3">
                      <select
                        id="filtroSistema"
                        className="form-select"
                        name="sistema"
                        value={filtros.sistema}
                        onChange={handleFiltroChange}
                        disabled={!(sistemas && sistemas.length)}
                      >
                        <option value="">{t.allSystems}</option>
                        {sistemas.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.numero_de_referencia} - {s.descripcion}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-md-3">
                      <select
                        id="filtroSubsistema"
                        className="form-select"
                        name="subsistema"
                        value={filtros.subsistema}
                        onChange={handleFiltroChange}
                        disabled={!(subsistemas && subsistemas.length)}
                      >
                        <option value="">{t.allSubsystems}</option>
                        {subsistemas.map(ss => (
                          <option key={ss.id} value={ss.id}>
                            {ss.numero_de_referencia} - {ss.descripcion}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-md-3">
                      <input
                        id="filtroNombre"
                        type="text"
                        className="form-control"
                        name="nombre"
                        value={filtros.nombre}
                        placeholder={t.searchByName}
                        onChange={handleFiltroChange}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div id="contenidoEquipos" className={`mt-4 ${grupoSeleccionado ? 'mostrar' : ''}`}>
                <div id="equiposContainer" className="row justify-content-between">
                  {equiposFiltrados.length > 0 ? (
                    equiposFiltrados.map(equipo => {
                      const imagenUrl = equipo.imagen ? `${API_BASE}/${String(equipo.imagen).replace(/\\\\/g,'/')}` : '/static/img/default_image.png';
                      return (
                        <div
                          key={equipo.id}
                          className="col-md-3 mb-4 card-container"
                          data-subgrupo={equipo.id_subgrupo || ''}
                          data-sistema={equipo.id_sistema || ''}
                          data-subsistema={equipo.id_subsistema || ''}
                          data-nombre={equipo.nombre_equipo.toLowerCase()}
                        >
                          <div
                            className={`card ${allowedNow ? '' : 'card-disabled'}`}
                            onClick={() => allowedNow && !equiposStatusLoading && handleOpenRonda(equipo.id)}
                            style={{ cursor: (allowedNow && !equiposStatusLoading) ? 'pointer' : 'not-allowed', position: 'relative', opacity: equiposStatusLoading ? 0.5 : 1 }}
                            title={equiposStatusLoading ? 'Cargando…' : (equiposDone[equipo.id] ? t.roundDone : (allowedNow ? 'Iniciar ronda' : 'Fuera de ventana'))}
                          >
                            <img src={imagenUrl} className="card-img" alt="Imagen del equipo" loading="lazy" onError={(e)=>{ e.currentTarget.src='/static/img/default_image.png'; }} />
                            {/* Mostrar código CJ si existe; fallback a campo 'cj', luego 'referencia', finalmente N/A */}
                            <div className="overlay-text">{equipo.codigo_cj || equipo.cj || equipo.referencia || 'N/A'}</div>
                            <h1>{equipo.nombre_equipo}</h1>
                            {equiposStatusLoading && (
                              <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>
                                Cargando…
                              </div>
                            )}
                            {equiposDone[equipo.id] && (
                              <div style={{
                                position: 'absolute',
                                top: 8,
                                left: 8,
                                background: 'rgba(25,135,84,0.92)',
                                color: '#fff',
                                padding: '4px 8px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: '600',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                boxShadow: '0 2px 6px rgba(0,0,0,0.25)'
                              }}>
                                <i className="bi bi-check-circle-fill" /> {t.roundDone}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    grupoSeleccionado && (
                      <p className="text-center text-muted">{t.noEquipments}</p>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
  </div>
)}

    </div>
    </>
  );
};

export default Rondas;
