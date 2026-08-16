import React, { useEffect } from 'react';

const ICON_BY_TYPE = {
  success: 'bi-check2-circle',
  error: 'bi-x-circle',
  warning: 'bi-exclamation-triangle',
  info: 'bi-info-circle',
};

const Toast = ({ id, message, type = 'success', duration = 2500, onClose }) => {
  useEffect(() => {
    const t = setTimeout(() => onClose?.(id), duration);
    return () => clearTimeout(t);
  }, [id, duration, onClose]);

  const icon = ICON_BY_TYPE[type] || ICON_BY_TYPE.success;

  return (
    <div className={`ef-toast ef-${type}`} role="status" aria-live="polite">
      <i className={`bi ${icon}`} />
      <span className="ef-msg">{message}</span>
      <button
        type="button"
        className="btn-close"
        aria-label="Cerrar"
        onClick={() => onClose?.(id)}
      />
      {/* barra de tiempo con duración dinámica */}
      <div className="ef-line" style={{ animationDuration: `${duration}ms` }} />
    </div>
  );
};

export default Toast;
