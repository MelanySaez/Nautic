import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import '../styles/preview-modal.css';

/* PreviewModal simplificado: sólo título (izquierda) y botón cerrar (derecha) */

const PreviewModal = ({ open, onClose, url, name, isPdf }) => {
  const contentRef = useRef(null);
  const wrapperRef = useRef(null);

  const handleKey = useCallback((e) => {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); onClose?.(); }
  }, [open, onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose?.();
  };

  const effectiveZoomStyle = () => ({ });

  if (!open) return null;

  return createPortal(
    <div className="pm-backdrop" role="dialog" aria-modal="true" onClick={handleBackdrop}>
      <div className="pm-shell" role="document" ref={wrapperRef}>
        <header className="pm-toolbar pm-toolbar-simple">
          <div className="pm-title" title={name || 'Vista previa'}>{name || 'Vista previa'}</div>
          <div className="pm-spacer" />
          <button className="pm-btn pm-close" onClick={onClose} title="Cerrar">✕</button>
        </header>
        <main className={`pm-content simple ${isPdf?'is-pdf':'is-image'}`} ref={contentRef} style={effectiveZoomStyle()}>
          {url ? (
            isPdf ? (
              <PdfInlineViewer url={url} name={name} />
            ) : (
              <div className="pm-img-wrapper">
                <img src={url} alt={name || 'preview'} className="pm-img" draggable={false} />
              </div>
            )
          ) : (
            <div className="pm-empty">No disponible.</div>
          )}
        </main>
      </div>
    </div>,
    document.body
  );
};

// Componente auxiliar para manejar bloqueo de PDF
function PdfInlineViewer({ url, name }) {
  const [status, setStatus] = useState('loading'); // loading | loaded | blocked
  const timerRef = useRef(null);

  useEffect(() => {
    // timeout si no carga en 3s
    timerRef.current = setTimeout(() => {
      if (status === 'loading') setStatus('blocked');
    }, 3000);
    return () => clearTimeout(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const handleLoad = () => {
    clearTimeout(timerRef.current);
    setStatus('loaded');
  };
  const handleError = () => {
    clearTimeout(timerRef.current);
    setStatus('blocked');
  };

  if (status === 'blocked') {
    return (
      <div className="pm-pdf-fallback">
        <div className="pm-pdf-fallback-box">
          <p>El visor embebido fue bloqueado por el navegador.</p>
          <div className="pm-actions-row">
            <a className="pm-btn" href={url} target="_blank" rel="noopener noreferrer">Abrir en pestaña</a>
            <a className="pm-btn" href={url} download={name || 'documento.pdf'}>Descargar</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pm-pdf-wrapper">
      <iframe
        title="pdf"
        src={url}
        className="pm-pdf-frame"
        allow="fullscreen"
        onLoad={handleLoad}
        onError={handleError}
      />
      {status === 'loading' && (
        <div className="pm-loading-overlay">
          <div className="pm-spinner" />
          <span>Cargando PDF…</span>
        </div>
      )}
    </div>
  );
}

export default PreviewModal;
