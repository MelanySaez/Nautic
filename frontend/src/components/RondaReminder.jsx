// src/components/RondaReminder.jsx
import React, { useEffect, useCallback, useState } from 'react';
import Icon from './Icon';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_BASE } from '../config';
import api from '../services/api'; // 

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999
};
const modalStyle = {
  background: 'var(--bs-body-bg, #fff)',
  color: 'var(--bs-body-color, #000)',
  width: 'min(520px, 92vw)',
  borderRadius: '16px',
  boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
  padding: '20px'
};
const headerStyle = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 };
const titleStyle  = { margin: 0, fontSize: 18, fontWeight: 600 };

const DAY_MAP = { D:0, L:1, M:2, X:3, J:4, V:5, S:6 };

function parseHHMM(s) {
  if (!s) return null;
  const [h, m] = s.split(':').map(n => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export default function RondaReminder() {
  // Sin autenticación
  const navigate = useNavigate();
  const _location = useLocation(); // not used directly; kept if future logic needs route context
  const isUser = null?.role === 'null';
  const USER_BUQUE_ID = null?.buque_id;

  const [show, setShow] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [slotKey, setSlotKey] = useState('');

  // Cargar la config del buque
  useEffect(() => {
    // Solo continuar si es usuario y tiene un buque asignado
    if (!isUser || !USER_BUQUE_ID) return;
    let abort = false;

    (async () => {
      try {
        // Usar la instancia api (con baseURL=/api) y extraer data
        const { data } = await api.get(`/buque/${USER_BUQUE_ID}/`);
        if (abort || !data) return;
        setCfg(data?.rondas_config || null);
      } catch (err) {
        console.error('Error cargando rondas_config:', err);
      }
    })();

    return () => { abort = true; };
  }, [isUser, USER_BUQUE_ID]);

  // Persistencia simple
  const setLastSeenSlot = (key) => localStorage.setItem('ronda:lastSlot', key || '');
  const getLastSeenSlot = () => localStorage.getItem('ronda:lastSlot') || '';
  const setPostponeUntil = (ts) => localStorage.setItem('ronda:postponeUntil', String(ts || 0));
  const getPostponeUntil = () => parseInt(localStorage.getItem('ronda:postponeUntil') || '0', 10);

  // ¿Toca ahora? (devuelve {due, key})
  const checkDue = useCallback(() => {
    if (!isUser || !cfg) return { due: false, key: '' };

    const now = new Date();
    const nowMs = now.getTime();
    const postponeUntil = getPostponeUntil();
    if (postponeUntil && nowMs < postponeUntil) return { due: false, key: '' };

    const day = now.getDay(); // 0..6 (Dom=0)
    const dias = Array.isArray(cfg.dias_activos) && cfg.dias_activos.length ? cfg.dias_activos : ['L','M','X','J','V'];
    if (!dias.some(letter => DAY_MAP[letter] === day)) return { due: false, key: '' };

    const unidad = cfg.unidad || 'hora';
    const intervalo = Math.max(1, Number(cfg.intervalo) || 1);

    const startMin = parseHHMM(cfg.ventana_inicio) ?? 0;
    const endMin   = parseHHMM(cfg.ventana_fin) ?? (24*60 - 1);
    const nowMin   = now.getHours()*60 + now.getMinutes();

    if (nowMin < startMin || nowMin > endMin) return { due: false, key: '' };

    if (unidad === 'dia') {
      if (nowMin === startMin) {
        const key = `${now.toISOString().slice(0,10)}|dia|${intervalo}|${startMin}`;
        return { due: true, key };
      }
      return { due: false, key: '' };
    }

    let stepMin = unidad === 'minuto' ? intervalo : intervalo * 60;
    if (stepMin <= 0) return { due: false, key: '' };

    // “gracia” de 1 minuto para disparar
    const GRACE_MIN = 1;
    const offset = nowMin - startMin;          // minutos desde inicio de ventana
    if (offset < 0) return { due: false, key: '' };

    const mod = offset % stepMin;              // resto con el paso
    if (mod < GRACE_MIN) {
      const slotIndex = Math.floor(offset / stepMin);
      const key = `${now.toISOString().slice(0,10)}|${unidad}|${intervalo}|${startMin}|${slotIndex}`;
      return { due: true, key };
    }
    return { due: false, key: '' };
  }, [isUser, cfg]);

  // Poll cada 15s
  useEffect(() => {
    if (!isUser || !cfg) return;
    const tick = () => {
      const { due, key } = checkDue();
      const last = getLastSeenSlot();
      if (due && key && key !== last) {
        setSlotKey(key);
        setShow(true);
      }
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, [isUser, cfg, checkDue]);

  if (!isUser) return null;
  if (!show) return null;

  const ventana =
    cfg?.ventana_inicio && cfg?.ventana_fin
      ? `${cfg.ventana_inicio}–${cfg.ventana_fin}`
      : 'hoy';

  const onNow = () => {
    setShow(false);
    setLastSeenSlot(slotKey);
    navigate('/rondas');
  };
  const onLater = (minutes = 5) => {
    setShow(false);
    setLastSeenSlot(slotKey);
    setPostponeUntil(Date.now() + minutes*60*1000);
  };
  const onClose = () => {
    setShow(false);
    setLastSeenSlot(slotKey);
  };

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="Ronda programada">
      <div style={modalStyle}>
        <div style={headerStyle}>
          <Icon name="clock" size={22} />
          <h5 style={titleStyle}>¡Ronda programada!</h5>
        </div>

        <p className="mb-1">
          Según la configuración del buque, corresponde realizar una ronda de mantenimiento.
        </p>
        <small className="text-muted d-block mb-3">
          Frecuencia: cada <b>{cfg?.intervalo || 1}</b> {cfg?.unidad || 'hora'}{(cfg?.intervalo||1) > 1 ? 's' : ''} ·
          ventana <b>{ventana}</b>
        </small>

        <div className="d-flex justify-content-end gap-2 mt-3">
          <button className="btn btn-outline-secondary" onClick={() => onLater(5)}>Posponer 5 min</button>
          <button className="btn btn-primary" onClick={onNow}>Realizar ahora</button>
          <button className="btn btn-link" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
