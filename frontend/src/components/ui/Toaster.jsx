import React from "react";
import { createPortal } from "react-dom";
import useToasts from "./useToasts";
import "./toast.css";

export default function Toaster() {
  const { toasts, removeToast } = useToasts();

  const container = (typeof document !== 'undefined') ? document.body : null;

  const content = (
    <div className="ef-toasts" aria-live="polite" aria-atomic="true">
      {toasts.map((t) => (
        <div key={t.id} className={`ef-toast ef-${t.type}`}>
          {/* Ícono por tipo */}
          <i className={
            t.type === "success" ? "bi bi-check2-circle" :
            t.type === "error"   ? "bi bi-x-circle"      :
            t.type === "warning" ? "bi bi-exclamation-triangle" :
                                   "bi bi-info-circle"
          } />
          <div className="ef-msg">{t.msg}</div>

          <button
            type="button"
            className="btn-close"
            aria-label="Cerrar"
            onClick={() => removeToast(t.id)}
          />

          {/* Línea de vida solo si hay autocierre */}
          {Number.isFinite(t.ttl) && t.ttl > 0 && (
            <div className="ef-line" style={{ animationDuration: `${t.ttl}ms` }} />
          )}
        </div>
      ))}
    </div>
  );

  if (!container) return content; // SSR-safe fallback
  return createPortal(content, container);
}
