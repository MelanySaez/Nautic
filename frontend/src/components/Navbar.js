// src/components/Navbar.jsx
import React, { useEffect, useMemo, useState, useRef } from 'react';
import '../styles/navbar-responsive.css';
import Icon from './Icon';
import './IOSDropdown.css';
import api from '../services/api';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import NewThemeSwitch from './NewThemeSwitch';
import NewMenuIcon from './NewMenuIcon';
import { TbWorld, TbPalette } from 'react-icons/tb';

const THEME_KEY = 'app_theme';    // 'light' | 'dark'
const LANG_KEY  = 'app_lang';     // 'es' | 'en'

const i18n = {
  es: {
    rounds: 'Rondas',
    performRound: 'Realizar Ronda',
    dashboard: 'Dashboard',
    comparative: 'Comparativa',
    history: 'Historial de Rondas',
    manageEquip: 'SWBS',
    manageParams: 'Gestión de parámetros',
    exportQR: 'Exportar QR',
    aiInspection: 'Inspección IA',
    adminUsers: 'Administrar usuarios', // plural
    adminUserSingle: 'Administrar usuario', // singular (user básico)
    theme: 'Tema',
    light: 'Claro',
    dark: 'Oscuro',
    language: 'Idioma',
    spanish: 'Español',
    english: 'Inglés',
  login: 'Login',
  logout: 'Logout',
    menu: 'Menú',
  },
  en: {
    rounds: 'Rounds',
    performRound: 'Perform Round',
    dashboard: 'Dashboard',
    comparative: 'Comparative',
    history: 'Rounds History',
    manageEquip: 'SWBS',
    manageParams: 'Parameter Management',
    exportQR: 'Export QR',
    aiInspection: 'AI Inspection',    
    adminUsers: 'Admin Users',
    adminUserSingle: 'Admin User',
    theme: 'Theme',
    light: 'Light',
    dark: 'Dark',
    language: 'Language',
    spanish: 'Spanish',
    english: 'English',
  login: 'Login',
  logout: 'Logout',
    menu: 'Menu',
  },
};

function loadTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const result = saved === 'dark' || saved === 'light' ? saved : 'light';
  return result;
}
function loadLang() {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === 'es' || saved === 'en') return saved;
  const nav = (navigator.language || 'es').toLowerCase();
  return nav.startsWith('en') ? 'en' : 'es';
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-bs-theme', theme);

  localStorage.setItem(THEME_KEY, theme);

  window.dispatchEvent(new CustomEvent('app:theme', { detail: { theme } }));

}
function applyLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
  window.dispatchEvent(new CustomEvent('app:language', { detail: { lang } }));
}
function getLogoSrc(theme) {
  return theme === 'dark' ? '/CotecmarLogo_white.svg' : '/CotecmarLogo.svg';
}

const Navbar = () => {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem('session')); } catch { return null; }
  });

  // Helper para normalizar URL del avatar (evita duplicar /media/media/ y agrega cache-busting si fue actualizado recientemente)
  const buildAvatarUrl = (raw) => {
    if (!raw) return '';
    let u = String(raw).trim();
    if (!u) return '';
    // Si ya es absoluta devolver tal cual
    if (/^https?:\/\//i.test(u)) return u;
    // Quitar query temporal para normalizar path base
    const [basePath, query] = u.split('?');
    u = basePath.replace(/^\/+/, '');
    // Eliminar repeticiones media/media/... -> media/ usando regex
    u = u.replace(/^(?:media\/)+(.*)$/i, '$1');
    // Ahora aseguramos prefijo /media/
    let finalUrl = `/media/${u}`;
    if (query) finalUrl += `?${query}`;
    return finalUrl;
  };
  
  const IS_ADMIN = session?.role === 'admin';
  const IS_SUPER = session?.role === 'superuser';
  const IS_BASIC = session?.role === 'user';
  const location = useLocation();
  const onLoginRoute = location.pathname.startsWith('/login');
  const showMainMenu = !!session && !onLoginRoute && null !== 'session-expired';



  

  const [theme, setTheme] = useState(() => {
    const initialTheme = loadTheme();
    return initialTheme;
  });
  const [lang, setLang] = useState(loadLang);
  const t = useMemo(() => i18n[lang] ?? i18n.es, [lang]);
  const nav = useNavigate(); // === NUEVO

  useEffect(() => { 
    applyTheme(theme); 
  }, [theme]);
  useEffect(() => { applyLang(lang); }, [lang]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/auth/me');
        const avatar = buildAvatarUrl(data.avatar_url || data.avatar_thumb_url || '');
        const s = {
          id: data.id,
          username: data.username,
          role: data.role,
          avatar_url: avatar || null,
          first_name: data.first_name || '',
          last_name: data.last_name || ''
        };
        setSession(s);
        localStorage.setItem('session', JSON.stringify(s));
      } catch {
        setSession(null);
        localStorage.removeItem('session');
      }
    })();
  }, []);

  useEffect(() => {
    const onAuth = (ev) => {
      const base = ev?.detail?.session ?? (() => {
        const raw = localStorage.getItem('session');
        return raw ? JSON.parse(raw) : null;
      })();
      if (base) {
        const avatarNorm = buildAvatarUrl(base.avatar_url || base.avatarUrl || base.avatar_thumb_url || '');
        setSession({
          avatar_url: avatarNorm || null,
          first_name: base.first_name || base.firstName || '',
          last_name: base.last_name || base.lastName || '',
          ...base
        });
      } else {
        setSession(null);
      }
    };
    const onStorage = (ev) => {
      if (ev.key === 'session') {
        setSession(ev.newValue ? JSON.parse(ev.newValue) : null);
      }
    };
    window.addEventListener('app:auth', onAuth);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('app:auth', onAuth);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    applyTheme(next);
  };
  const onLangChange = (e) => {
    const next = e.target.value;
    setLang(next);
    applyLang(next);
  };

  // Removed manual event suppression; we'll rely on Bootstrap's data-bs-auto-close="outside"

  const linkCls = ({ isActive }) => `nav-link ${isActive ? 'active' : ''}`;

  const SunIcon = <Icon name="theme" size={18} />; // usando sun variant
  const MoonIcon = <Icon name="dark" size={18} />;
  const HamburgerIcon = <Icon name="menu" size={22} />;

  // === NUEVO: logout real (borra cookies en backend y limpia sesión local)
  const logout = async () => {
    try { await api.post('/auth/logout'); } finally {
      localStorage.removeItem('session');
      setSession(null);
      // Notifica a la app que ya no hay sesión
      window.dispatchEvent(new CustomEvent('app:auth', { detail: { session: null } }));
      nav('/login', { replace: true });
    }
  };


  const adminUsersLabel = IS_BASIC ? (t.adminUserSingle || t.adminUsers) : t.adminUsers;

  const getInitials = (s) => {
    if(!s) return '?';
    const fn = (s.first_name||'').trim().split(/\s+/).filter(Boolean);
    const ln = (s.last_name||'').trim().split(/\s+/).filter(Boolean);
    let letters = [];
    if (fn.length) letters.push(fn[0][0]);
    if (ln.length) letters.push(ln[0][0]);
    if (letters.length < 2) {
      // fallback: usar username dividido por separadores
      const uParts = (s.username||'').split(/[^A-Za-z0-9]+/).filter(Boolean);
      if (letters.length === 0 && uParts.length) letters.push(uParts[0][0]);
      if (letters.length === 1 && uParts.length > 1) letters.push(uParts[1][0]);
    }
    return letters.join('').slice(0,2).toUpperCase() || '?';
  };

  // Detectar si el navbar está colapsado (pantalla pequeña)
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Refs y estado para el manejo del menú de acciones
  const actionsBtnRef = useRef(null);
  const [actionsOpen, setActionsOpen] = useState(false);

  // Refs y estado para el manejo del overflow del navbar
  const leftNavRef = useRef(null);
  const moreRef = useRef(null);
  const [overflowItems, setOverflowItems] = useState([]);
  useEffect(() => {
    const handler = () => {
      setIsCollapsed(window.innerWidth < 992); // Bootstrap lg breakpoint
    };
    handler();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Keep MenuIcon synced with Bootstrap dropdown open/close
  useEffect(() => {
    const btn = actionsBtnRef.current;
    if (!btn) return;
    const onShown = () => setActionsOpen(true);
    const onHidden = () => setActionsOpen(false);
    btn.addEventListener('shown.bs.dropdown', onShown);
    btn.addEventListener('hidden.bs.dropdown', onHidden);
    return () => {
      btn.removeEventListener('shown.bs.dropdown', onShown);
      btn.removeEventListener('hidden.bs.dropdown', onHidden);
    };
  }, [actionsBtnRef]);

  // Removed custom click listeners to avoid interfering with React event system

  // Measure overflow of left nav items and move extras into a More dropdown (prioritize stable "Más")
  useEffect(() => {
    if (!leftNavRef.current) return;
    const el = leftNavRef.current;

    // Utility to shallow-compare arrays (order matters)
    const eqArr = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

    const rafId = { current: 0 };
    const measureNow = () => {
      if (!el) return;
      if (window.innerWidth < 992) { if (overflowItems.length) setOverflowItems([]); return; }
      const containerWidth = el.clientWidth;
      const items = Array.from(el.querySelectorAll('[data-itemkey]'));
      // Reserve space for the actual "Más" button width (measured), fallback to 72
      const moreW = moreRef.current ? Math.max(moreRef.current.offsetWidth || 0, 72) : 72;
      let used = 0;
      const overflow = [];
      for (const item of items) {
        const w = item.offsetWidth; // if previously hidden, this might be 0; we rely on reserved more space to avoid flicker
        if (used + w + moreW + 8 > containerWidth) {
          overflow.push(item.getAttribute('data-itemkey'));
        } else {
          used += w;
        }
      }
      if (!eqArr(overflowItems, overflow)) setOverflowItems(overflow);
    };
    const schedule = () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(measureNow);
    };

    const ro = new ResizeObserver(() => schedule());
    ro.observe(el);
    // also observe children for label length changes
    el.querySelectorAll('[data-itemkey]').forEach(c => ro.observe(c));
    if (moreRef.current) ro.observe(moreRef.current);
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', schedule);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [lang, theme, showMainMenu, overflowItems.length]);

  return (
  <nav className="navbar navbar-expand-lg main-navbar">
      <div className="container-fluid">
        {/* Marca */}
        {session ? (
          <a className="navbar-brand d-flex align-items-center gap-1" href="/" aria-label="Inicio">
            <img
              src={getLogoSrc(theme)}
              alt="COTECMAR"
              width="40"
              height="40"
              className="d-inline-block"
              style={{ display: 'block' }}
            />
          </a>
        ) : (
          <div className="navbar-brand d-flex align-items-center gap-1">
            <img
              src={getLogoSrc(theme)}
              alt="COTECMAR"
              width="40"
              height="40"
              className="d-inline-block"
              style={{ display: 'block' }}
            />
          </div>
        )}

        {/* Toggler de colapso (izquierda, estándar Bootstrap) */}
        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarNav"
          aria-controls="navbarNav"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>

        {/* Contenido colapsable */}
        <div className="collapse navbar-collapse" id="navbarNav">
          {/* Menú izquierdo: versión lite siempre visible */}
          <ul className="navbar-nav">
            {/* Rondas */}
            <li className={`nav-item me-1 ${(!isCollapsed && overflowItems.includes('rondas')) ? 'nav-overflow-hidden' : ''}`} data-itemkey="rondas">
              <NavLink to="/rondas" className={linkCls}>
                {t.rounds}
              </NavLink>
            </li>
            
            {/* SWBS (Documentación Técnica) */}
            <li className={`nav-item me-1 ${(!isCollapsed && overflowItems.includes('swbs')) ? 'nav-overflow-hidden' : ''}`} data-itemkey="swbs">
              <NavLink to="/gestion-configuracion" className={linkCls}>
                {t.manageEquip}
              </NavLink>
            </li>
            
            {/* Gestión de Parámetros */}
            <li className={`nav-item me-1 ${(!isCollapsed && overflowItems.includes('parametros')) ? 'nav-overflow-hidden' : ''}`} data-itemkey="parametros">
              <NavLink to="/gestion_parametros" className={linkCls}>{t.manageParams}</NavLink>
            </li>
            
            {/* Buques */}
            <li className={`nav-item me-1 ${(!isCollapsed && overflowItems.includes('buques')) ? 'nav-overflow-hidden' : ''}`} data-itemkey="buques">
              <NavLink to="/buques" className={linkCls}>Buques</NavLink>
            </li>

            {/* Inspección IA */}
            <li className={`nav-item me-1 ${(!isCollapsed && overflowItems.includes('ai-inspection')) ? 'nav-overflow-hidden' : ''}`} data-itemkey="ai-inspection">
              <NavLink to="/ai-inspection" className={linkCls}>{t.aiInspection}</NavLink>
            </li>
            
            {/* Más (overflow) - siempre en flujo para evitar parpadeo; oculto con visibility cuando no se necesita */}
            <li
              className={`nav-item dropdown ms-1 more ${(!isCollapsed && overflowItems.length === 0) ? 'more--hidden' : ''}`}
              ref={moreRef}
              style={{ display: !isCollapsed ? 'block' : 'none' }}
            >
              <a href="#" className="nav-link dropdown-toggle more-toggle" role="button" data-bs-toggle="dropdown" aria-expanded="false" onClick={e=>e.preventDefault()}>
                {t.menu || 'Menú'}
              </a>
              <ul className="dropdown-menu ios-dropdown">
                {overflowItems.includes('rondas') && (<li><NavLink className="dropdown-item ios-menu-item" to="/rondas">{t.rounds}</NavLink></li>)}
                {overflowItems.includes('swbs') && (<li><NavLink className="dropdown-item ios-menu-item" to="/gestion-configuracion">{t.manageEquip}</NavLink></li>)}
                {overflowItems.includes('parametros') && (<li><NavLink className="dropdown-item ios-menu-item" to="/gestion_parametros">{t.manageParams}</NavLink></li>)}
                {overflowItems.includes('buques') && (<li><NavLink className="dropdown-item ios-menu-item" to="/buques">Buques</NavLink></li>)}
                {overflowItems.includes('ai-inspection') && (<li><NavLink className="dropdown-item ios-menu-item" to="/ai-inspection">{t.aiInspection}</NavLink></li>)}
              </ul>
            </li>
          </ul>
          
          {/* Barra compacta en modo colapsado: idioma + tema */}
          {isCollapsed && (
            <div className="w-100 mt-3 mb-2 d-flex flex-wrap align-items-center justify-content-center gap-3 px-2" style={{borderTop:'1px solid rgba(0,0,0,0.08)', paddingTop:12}}>
              <div className="d-flex align-items-center small">
                <label htmlFor="langSelectCollapse" className="me-2 mb-0 text-body small">{t.language}:</label>
                <select
                  id="langSelectCollapse"
                  className="form-select form-select-sm"
                  value={lang}
                  onChange={onLangChange}
                  aria-label={t.language}
                  style={{ minWidth: 110 }}
                >
                  <option value="es">🇨🇴 {t.spanish}</option>
                  <option value="en">🇺🇸 {t.english}</option>
                </select>
              </div>
              <div className="d-flex align-items-center small">
                <NewThemeSwitch checked={theme === 'dark'} onChange={toggleTheme} ariaLabel={t.theme} />
                <span className="theme-label ms-2" aria-hidden="true" style={{display:'inline-block', minWidth:60, textAlign:'left'}}>
                  {theme === 'dark' ? t.dark : t.light}
                </span>
              </div>
            </div>
          )}

          {/* Lado derecho (solo visible en escritorio, evita duplicación en colapsado) */}
          {!isCollapsed && (
            <ul className="navbar-nav ms-auto align-items-center">
              {session && (
                <li className="nav-item ms-3 d-flex align-items-center">
                  <button
                    type="button"
                    onClick={()=>nav('/perfil')}
                    className="nav-user-avatar-btn"
                    aria-label="Perfil"
                    title={session.username}
                  >
                    {/* Avatar círculo */}
                    <span className="nav-avatar-circle">
                      {session.avatar_url ? (
                        <img src={session.avatar_url} alt="avatar" onError={(e)=>{e.currentTarget.style.display='none';}} />
                      ) : (
                        <span className="nav-avatar-initials">{getInitials(session)}</span>
                      )}
                    </span>
                  </button>
                </li>
              )}
              <li className="nav-item dropdown ms-2 dropdown-no-close position-relative">
                <button ref={actionsBtnRef} className="d-flex align-items-center" id="navbarActionsMenuBtn" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false" aria-label={t.menu} style={{ background: 'none', border: 'none', boxShadow: 'none', padding: 0, margin: 0, minWidth: 0 }}>
                  <NewMenuIcon checked={actionsOpen} onChange={()=>{}} ariaLabel={t.menu} />
                </button>
                <ul
                  className="dropdown-menu dropdown-menu-end ios-dropdown"
                  aria-labelledby="navbarActionsMenuBtn"
                >
                  {/* Configuración de Idioma */}
                  <li className="ios-setting-item">
                    <div className="d-flex align-items-center justify-content-between">
                      <label className="ios-setting-label">
                        <TbWorld className="ios-setting-icon" />
                        {t.language}
                      </label>
                      <select
                        className="ios-select"
                        value={lang}
                        onChange={onLangChange}
                        aria-label={t.language}
                      >
                        <option value="es">🇨🇴 {t.spanish}</option>
                        <option value="en">🇺🇸 {t.english}</option>
                      </select>
                    </div>
                  </li>
                  
                  {/* Configuración de Tema */}
                  <li className="ios-setting-item">
                    <div className="d-flex align-items-center justify-content-between">
                      <label className="ios-setting-label">
                        <TbPalette className="ios-setting-icon" />
                        {t.theme}
                      </label>
                      <div className="ios-theme-container">
                        {(() => {
                          return (
                            <NewThemeSwitch 
                              checked={theme === 'dark'} 
                              onChange={toggleTheme} 
                              ariaLabel={t.theme} 
                            />
                          );
                        })()}
                        <span className="ios-theme-label">
                          {theme === 'dark' ? t.dark : t.light}
                        </span>
                      </div>
                    </div>
                  </li>
                  
                  <li><hr className="ios-divider" /></li>
                </ul>
              </li>
            </ul>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
