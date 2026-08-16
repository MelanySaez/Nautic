import React, { useState, useEffect, useRef } from 'react';
import Icon from './Icon';

/**
 * Componente reutilizable de captura de cámara.
 *
 * Props:
 *   onPhotoTaken(file, previewDataUrl) — se llama al capturar o elegir de galería
 *   onCancel()                         — se llama al pulsar "Cancelar"
 *   t          — objeto i18n con keys: gallery, cancel (mínimo)
 *   filePrefix — prefijo del nombre del archivo generado (default: 'foto')
 */
const CameraCapture = ({ onPhotoTaken, onCancel, t, filePrefix = 'foto' }) => {
  const [state, setState] = useState({ loading: true, error: '', active: false });
  const [cameras, setCameras] = useState([]);
  const [index, setIndex] = useState(0);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const retryRef = useRef(0);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(tr => { try { tr.stop(); } catch(_){} });
      streamRef.current = null;
    }
  };

  const enumerate = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const vids = devices.filter(d => d.kind === 'videoinput');
      setCameras(vids);
      if (!vids.length) throw new Error('No hay cámaras disponibles');
    } catch (e) {
      setState(s => ({ ...s, error: e.message || 'Error enumerando cámaras', loading: false }));
    }
  };

  const start = async (cameraIndex = 0) => {
    stopStream();
    setState(s => ({ ...s, loading: true, error: '' }));
    try {
      const chosen = cameras[cameraIndex];
      const constraints = {
        video: chosen ? { deviceId: { exact: chosen.deviceId } } : { facingMode: cameraIndex === 0 ? 'environment' : 'user' },
        audio: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().then(() => {
            setState(s => ({ ...s, loading: false, active: true }));
          }).catch(() => {
            setState(s => ({ ...s, error: 'No se pudo reproducir el video', loading: false }));
          });
        };
      }
    } catch (e) {
      console.error('start camera error', e);
      if (retryRef.current < 2) {
        retryRef.current += 1;
        setTimeout(() => start(cameraIndex), 500);
      } else {
        setState(s => ({ ...s, error: e.message || 'Error iniciando cámara', loading: false }));
      }
    }
  };

  const switchCamera = () => {
    if (cameras.length < 2) return;
    const next = (index + 1) % cameras.length;
    setIndex(next);
    start(next);
  };

  const capture = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (blob) {
        const file = new File([blob], `${filePrefix}_${Date.now()}.jpg`, { type: 'image/jpeg' });
        const preview = canvas.toDataURL('image/jpeg');
        onPhotoTaken(file, preview);
      }
    }, 'image/jpeg', 0.9);
  };

  const uploadFromGallery = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = ev => onPhotoTaken(file, ev.target.result);
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  useEffect(() => {
    (async () => {
      await enumerate();
      await start(0);
    })();
    return () => stopStream();
  }, []); // eslint-disable-line

  return (
    <div className="camera-capture-container narrow">
      <div className="camera-body auto">
        {state.loading && (
          <div className="camera-loading">
            <div className="spinner" />
            <p>Iniciando cámara…</p>
          </div>
        )}
        {state.error && !state.loading && (
          <div className="camera-error">
            <p>{state.error}</p>
            <button className="btn btn-outline-primary btn-sm" onClick={() => start(index)}>Reintentar</button>
          </div>
        )}
        <video
          ref={videoRef}
          className={`camera-video ${state.active ? 'visible' : 'hidden'}`}
          playsInline
          muted
          autoPlay
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        {cameras.length > 1 && state.active && (
          <button className="camera-switch-btn" onClick={switchCamera} title="Cambiar cámara">
            <Icon name="cameraSwitch" size={22} />
          </button>
        )}
      </div>
      <div className="camera-footer compact">
        <div className="camera-controls compact">
          <button className="btn btn-outline-secondary camera-control-btn" onClick={uploadFromGallery}>{t.gallery}</button>
          <button className="btn btn-primary camera-capture-btn" disabled={!state.active} onClick={capture}>
            <span className="capture-ring" />
          </button>
          <button className="btn btn-outline-danger camera-control-btn" onClick={onCancel}>{t.cancel}</button>
        </div>
      </div>
    </div>
  );
};

export default CameraCapture;
