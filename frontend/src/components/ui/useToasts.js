import { useEffect, useState } from "react";

/** Cambia este valor global para depurar (p. ej. 20000 o 60000) */
export const DEFAULT_TOAST_TTL = 3200; // ms

let _subs = new Set();
let _toasts = [];
let _id = 0;

function notify() {
  for (const cb of _subs) cb(_toasts);
}

export default function useToasts() {
  const [toasts, setToasts] = useState(_toasts);

  useEffect(() => {
    _subs.add(setToasts);
    return () => _subs.delete(setToasts);
  }, []);

  const removeToast = (id) => {
    _toasts = _toasts.filter((t) => t.id !== id);
    notify();
  };

  /**
   * pushToast(msg, type='info', ttl=DEFAULT_TOAST_TTL)
   * - ttl > 0: se autocierra tras ttl ms
   * - ttl <= 0 o Infinity: NO se autocierra (solo manual con la X)
   */
  const pushToast = (msg, type = "info", ttl = DEFAULT_TOAST_TTL) => {
    const id = ++_id;
    const toast = { id, msg, type, ttl };
    _toasts = [..._toasts, toast];
    notify();

    if (Number.isFinite(ttl) && ttl > 0) {
      setTimeout(() => removeToast(id), ttl);
    }
    return id;
  };

  return { toasts, pushToast, removeToast };
}
