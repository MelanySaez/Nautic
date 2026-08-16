import React, { useEffect, useState, useRef } from 'react';
// import { API_BASE } from '../config';
import './gestion_parametros.css';
import Swal from 'sweetalert2';
import api from '../services/api';

const asArr = (d) => (Array.isArray(d) ? d : (d?.results || []));

const GestionParametros = () => {
  const [parametros, setParametros] = useState([]);
  const [subsistemas, setSubsistemas] = useState([]);
  const [subsistemasSeleccionados, setSubsistemasSeleccionados] = useState([]);
  const [parametroActivo, setParametroActivo] = useState(null);

  const [modoDeRelacion, setModoDeRelacion] = useState('parametro');
  const [subsistemaActivo, setSubsistemaActivo] = useState(null);
  const [parametrosRelacionados, setParametrosRelacionados] = useState([]);

  const [grupos, setGrupos] = useState([]);
  const [subgrupos, setSubgrupos] = useState([]);
  const [sistemas, setSistemas] = useState([]);
  const [subsistemasGlobal, setSubsistemasGlobal] = useState([]);

  const [selectedGrupo, setSelectedGrupo] = useState('');
  const [selectedSubgrupo, setSelectedSubgrupo] = useState('');
  const [selectedSistema, setSelectedSistema] = useState('');

  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const toggleFiltros = () => setFiltrosAbiertos(prev => !prev);
  const cerrarFiltros = () => setFiltrosAbiertos(false);

  // Helper para determinar si un grupo base (2,3,5) está activo.
  // El estado puede almacenar '2' o '200' (igual para 3/300, 5/500) dependiendo del origen de la selección.
  const grupoActivo = (base) => {
    if (!selectedGrupo) return false;
    const sg = String(selectedGrupo);
    const b = String(base);
    return sg === b || sg.startsWith(b); // cubre '2' y '200', etc.
  };

  // ===== IDs temporales para varias filas nuevas =====
  const tempIdRef = useRef(0);
  const newTempId = () => `tmp-${Date.now()}-${tempIdRef.current++}`;

  // ===== Carga inicial de parámetros =====
  useEffect(() => {
  (async () => {
    try {
      const { data } = await api.get('/parametros/');
      setParametros(asArr(data));
    } catch (err) {
      console.error('❌ Error al cargar parámetros:', err);
    }
  })();
}, []);


  // ===== Seleccionar parámetro (evita seleccionar filas nuevas) =====
  const seleccionarParametro = async (parametro) => {
    if (parametro?._isNew) return;
    setParametroActivo(parametro);
    setSubsistemaActivo(null);

    try {
      const { data } = await api.get(`/parametros/${parametro.id}/subsistemas/`);
      const ids = asArr(data).map((n) => Number(n)).filter(Number.isFinite);
      setSubsistemasSeleccionados(ids);
    } catch (err) {
      console.error('❌ Error al precargar subsistemas del parámetro:', err);
      setSubsistemasSeleccionados([]);
    }
  };


  // ===== Relaciones parámetro -> subsistemas =====
  const toggleRelacionSubsistema = (subsistemaId) => {
    const idNum = Number(subsistemaId);
    const ya = subsistemasSeleccionados.includes(idNum);
    setSubsistemasSeleccionados(prev => ya ? prev.filter(id => id !== idNum) : [...prev, idNum]);
  };

  const guardarRelaciones = async () => {
    if (!parametroActivo) return;
    try {
      await api.post(`/parametros/${parametroActivo.id}/relacionar_subsistemas/`, {
        subsistemas: subsistemasSeleccionados,
      });
      Swal.fire({ icon: 'success', title: 'Relación guardada', iconColor: '#003366', confirmButtonColor: '#003366' });
    } catch {
      Swal.fire({ icon: 'error', title: 'Error al guardar relación', text: 'Intenta nuevamente.', iconColor: '#922b21', confirmButtonColor: '#922b21' });
    }
  };


  // ===== CRUD inline =====
  const handleParametroChange = (index, field, value) => {
    setParametros(prev => {
      const copia = [...prev];
      copia[index] = { ...copia[index], [field]: value };
      return copia;
    });
  };

  const editarParametro = (index) => {
    setParametros(prev => {
      const copia = [...prev];
      copia[index] = { ...copia[index], editando: !copia[index].editando };
      return copia;
    });
  };

  const guardarParametro = async (index) => {
    const p = parametros[index];
    try {
      await api.post(`/parametros/actualizar/${p.id}/`, {
        nombre: p.nombre,
        unidad: p.unidad,
        valor_maximo: p.valor_maximo,
        valor_minimo: p.valor_minimo,
      });
      setParametros((prev) => {
        const copia = [...prev];
        copia[index] = { ...copia[index], editando: false };
        return copia;
      });
      Swal.fire({ icon: 'success', title: '¡Guardado correctamente!', iconColor: '#003366', confirmButtonColor: '#003366' });
    } catch {
      Swal.fire({ icon: 'error', title: 'Error al guardar', text: 'No se pudo actualizar el parámetro.', iconColor: '#922b21', confirmButtonColor: '#922b21' });
    }
  };


  const eliminarParametro = (id) => {
    Swal.fire({
      title: '¿Eliminar este parámetro?',
      text: "Esta acción no se puede deshacer.",
      icon: 'warning',
      iconColor: '#922b21',
      showCancelButton: true,
      confirmButtonColor: '#003366',
      cancelButtonColor: '#922b21',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    }).then(async (result) => {
      if (!result.isConfirmed) return;
      try {
        await api.delete(`/parametros/eliminar/${id}/`);
        setParametros((prev) => prev.filter((p) => p.id !== id));
        Swal.fire({ icon: 'success', title: 'Eliminado', iconColor: '#003366', confirmButtonColor: '#003366' });
      } catch {
        Swal.fire({ icon: 'error', title: 'Error al eliminar', text: 'No se pudo borrar el parámetro.', iconColor: '#922b21', confirmButtonColor: '#922b21' });
      }
    });
  };


  // ===== Jerarquía filtros/selección de subsistemas =====
  useEffect(() => {
  (async () => {
    try {
      const { data } = await api.get('/grupos/');
      setGrupos(asArr(data));
    } catch (err) {
      console.error('❌ Error al cargar grupos:', err);
    }
  })();
}, []);


  const handleGrupoChange = async (e) => {
    const grupoId = e.target.value;
    setSelectedGrupo(grupoId);
    setSelectedSubgrupo(''); setSelectedSistema('');
    setSubgrupos([]); setSistemas([]); setSubsistemas([]);

    try {
      const { data: subgs } = await api.post('/subgrupos/', { grupo_id: grupoId });
      setSubgrupos(asArr(subgs));
    } catch (err) {
      console.error('❌ Error al cargar subgrupos:', err);
    }

    const gSel = grupos.find(g => String(g.id) === String(grupoId));
    const grupoCodigo = gSel?.numero_de_referencia ? String(gSel.numero_de_referencia)[0] : '';

    if (grupoCodigo) {
      try {
        const { data } = await api.get(`/subsistemas/por-grupo/${grupoCodigo}/`);
        const arr = asArr(data);
        setSubsistemasGlobal(arr);
        setSubsistemas(arr);
      } catch (err) {
        console.error('❌ Error al cargar subsistemas por grupo:', err);
        setSubsistemasGlobal([]); setSubsistemas([]);
      }
    } else {
      setSubsistemasGlobal([]); setSubsistemas([]);
    }
  };



  const handleGrupoBtn = async (grupoCodigo) => {
    setSelectedGrupo(grupoCodigo);
    setSelectedSubgrupo(''); setSelectedSistema('');
    setSubgrupos([]); setSistemas([]); setSubsistemas([]);

    try {
      const { data: subgs } = await api.post('/subgrupos/', { grupo_id: grupoCodigo });
      setSubgrupos(asArr(subgs));
    } catch {}

    try {
      const { data } = await api.get(`/subsistemas/por-grupo/${grupoCodigo}/`);
      const arr = asArr(data);
      setSubsistemasGlobal(arr);
      setSubsistemas(arr);
    } catch (err) {
      console.error('❌ Error al cargar subsistemas por grupo:', err);
    }
  };


  useEffect(() => {
    if (modoDeRelacion !== 'subsistema') return;

    if (!selectedGrupo) {
      handleGrupoBtn('2'); // precarga 200 (grupo "2")
      return;
    }

    if (subsistemasGlobal.length === 0) {
      const gSel = grupos.find(g => String(g.id) === String(selectedGrupo));
      const codigo = gSel?.numero_de_referencia ? String(gSel.numero_de_referencia)[0] : String(selectedGrupo);
      if (codigo) {
        api.get(`/subsistemas/por-grupo/${codigo}/`)
          .then(({ data }) => {
            const arr = asArr(data);
            setSubsistemasGlobal(arr);
            setSubsistemas(arr);
          })
          .catch(err => console.error('❌ Error al cargar subsistemas por grupo:', err));
      }
    }
  }, [modoDeRelacion]); // eslint-disable-line



  const handleSubgrupoChange = async (e) => {
    const subgrupoId = e.target.value;
    setSelectedSubgrupo(subgrupoId);
    setSelectedSistema(''); setSistemas([]);

    const subgrupoSel = subgrupos.find(sg => String(sg.id) === String(subgrupoId));
    if (subgrupoSel) {
      const filtro = String(subgrupoSel.numero_de_referencia).substring(0, 2);
      const filtrados = subsistemasGlobal.filter(sub => String(sub.numero_de_referencia).startsWith(filtro));
      setSubsistemas(filtrados);
    } else {
      setSubsistemas(subsistemasGlobal);
    }

    try {
      const { data } = await api.post('/sistemas/', { subgrupo_id: subgrupoId });
      setSistemas(asArr(data));
    } catch (err) {
      console.error('❌ Error al cargar sistemas:', err);
    }
  };


  const handleSistemaChange = async (e) => {
    const sistemaId = e.target.value;
    setSelectedSistema(sistemaId);

    try {
      const { data } = await api.post('/subsistemas/', { sistema_id: sistemaId });
      setSubsistemas(asArr(data));
    } catch (err) {
      console.error('❌ Error al cargar subsistemas:', err);
    }
  };


  const seleccionarSubsistema = async (subsistema) => {
    setSubsistemaActivo(subsistema);
    setParametroActivo(null);
    try {
      const { data } = await api.get(`/subsistemas/${subsistema.id}/parametros/`);
      const ids = asArr(data).map(Number).filter(Number.isFinite);
      setParametrosRelacionados(ids);
    } catch (err) {
      console.error('❌ Error al cargar parámetros relacionados:', err);
      setParametrosRelacionados([]);
    }
  };


  const toggleRelacionParametro = (parametroId) => {
    const yaRelacionado = parametrosRelacionados.includes(parametroId);
    setParametrosRelacionados(prev => yaRelacionado ? prev.filter(id => id !== parametroId) : [...prev, parametroId]);
  };

  const guardarRelacionesSubsistema = async () => {
    if (!subsistemaActivo) return;
    try {
      await api.post(`/subsistemas/${subsistemaActivo.id}/relacionar_parametros/`, {
        parametros: parametrosRelacionados,
      });
      Swal.fire({ icon: 'success', title: 'Relación guardada', iconColor: '#003366', confirmButtonColor: '#003366' });
    } catch {
      Swal.fire({ icon: 'error', title: 'Error al guardar relación', text: 'Intenta nuevamente.', iconColor: '#922b21', confirmButtonColor: '#922b21' });
    }
  };


  // ===== Alta inline (varias filas) =====
  const iniciarNuevoParametro = () => {
    const temp = {
      id: newTempId(),
      nombre: '',
      unidad: '',
      valor_maximo: '',
      valor_minimo: '',
      editando: true,
      _isNew: true
    };
    setParametros(prev => [temp, ...prev]); // siempre arriba
    setParametroActivo(null);
  };

  const cancelarNuevoInline = (tempId) => {
    setParametros(prev => prev.filter(p => p.id !== tempId));
  };

  const guardarNuevoInline = async (tempId) => {
    const temp = parametros.find(x => x.id === tempId);
    if (!temp) return;

    if (!temp.nombre?.trim()) {
      Swal.fire({ icon: 'warning', title: 'El nombre es obligatorio' });
      return;
    }

    try {
      const { data } = await api.post('/parametros/agregar/', {
        nombre: temp.nombre,
        unidad: temp.unidad,
        valor_maximo: temp.valor_maximo,
        valor_minimo: temp.valor_minimo,
      });

      const creado = data || {};
      const merged = {
        ...temp,
        ...creado,
        id: creado.id ?? temp.id,
        _isNew: false,
        editando: false,
      };

      setParametros((prev) => [merged, ...prev.filter((x) => x.id !== tempId)]);
      Swal.fire({ icon: 'success', title: '¡Parámetro agregado!', iconColor: '#003366', confirmButtonColor: '#003366' });
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error al agregar', text: 'Verifica los datos e intenta nuevamente.', iconColor: '#922b21', confirmButtonColor: '#922b21' });
    }
  };


 return (
  <div className="p-4 mt-0 rounded">
    <div style={{ display: 'flex', gap: '0.5rem', padding: '.5rem 0 0 0', height: '84vh', overflowY: 'hidden' }}>
      {/* Columna izquierda: módulo de selección */}
      <div className="seleccion-container">
        <div className="seleccion-header">
          <h5 className="page-title mb-0">
            {modoDeRelacion === 'parametro' ? 'Gestión de Parámetros' : 'Selección de Subsistemas'}
          </h5>

          {modoDeRelacion === 'parametro' && (
            <button className="btn-agregar-parametro" onClick={iniciarNuevoParametro} title="Añadir parámetro">
              <i className="bi bi-plus-circle-fill" style={{ fontSize: '1.2rem' }}></i>
              Añadir Parámetro
            </button>
          )}
        </div>

        {/* 👇 NUEVO: cuerpo scrollable de la columna izquierda */}
        <div className="seleccion-body">
          {modoDeRelacion === 'parametro' ? (
            <div className="tabla-parametros">
              <div className="tabla-header">
                <span>NOMBRE</span>
                <span>UNIDAD</span>
                <span>VALOR MÁXIMO</span>
                <span>VALOR MÍNIMO</span>
                <span className="acciones-col">ACCIONES</span>
              </div>

              {parametros.map((p, index) => {
                const isEditable = p.editando || p._isNew;

                return (
                  <div
                    key={p.id}
                    className={`tabla-fila ${(parametroActivo?.id === p.id || isEditable) ? 'activo' : ''} ${isEditable ? 'editing' : ''}`}
                    onClick={() => { if (!p._isNew) seleccionarParametro(p); }}
                    style={{ cursor: p._isNew ? 'default' : 'pointer' }}
                  >
                    <input
                      type="text"
                      value={p.nombre ?? ''}
                      disabled={!isEditable}
                      readOnly={!isEditable}
                      tabIndex={isEditable ? 0 : -1}
                      style={!isEditable ? { pointerEvents: 'none', background: 'transparent', cursor: 'pointer' } : {}}
                      onChange={e => handleParametroChange(index, 'nombre', e.target.value)}
                    />
                    <input
                      type="text"
                      value={p.unidad ?? ''}
                      disabled={!isEditable}
                      readOnly={!isEditable}
                      tabIndex={isEditable ? 0 : -1}
                      style={!isEditable ? { pointerEvents: 'none', background: 'transparent', cursor: 'pointer' } : {}}
                      onChange={e => handleParametroChange(index, 'unidad', e.target.value)}
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={p.valor_maximo ?? ''}
                      disabled={!isEditable}
                      readOnly={!isEditable}
                      tabIndex={isEditable ? 0 : -1}
                      style={!isEditable ? { pointerEvents: 'none', background: 'transparent', cursor: 'pointer' } : {}}
                      onChange={e => handleParametroChange(index, 'valor_maximo', e.target.value)}
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={p.valor_minimo ?? ''}
                      disabled={!isEditable}
                      readOnly={!isEditable}
                      tabIndex={isEditable ? 0 : -1}
                      style={!isEditable ? { pointerEvents: 'none', background: 'transparent', cursor: 'pointer' } : {}}
                      onChange={e => handleParametroChange(index, 'valor_minimo', e.target.value)}
                    />

                    <div className="acciones">
                      {p._isNew ? (
                        <>
                          <button className="btn-editar" title="Guardar nuevo parámetro"
                                  onClick={e => { e.stopPropagation(); guardarNuevoInline(p.id); }}>
                            <i className="bi bi-floppy2-fill"></i>
                          </button>
                          <button className="btn-cancelar" title="Cancelar"
                                  onClick={e => { e.stopPropagation(); cancelarNuevoInline(p.id); }}>
                            <i className="bi bi-x"></i>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="btn-editar"
                            title={p.editando ? 'Guardar cambios' : 'Editar'}
                            onClick={e => {
                              e.stopPropagation();
                              p.editando ? guardarParametro(index) : editarParametro(index);
                            }}
                          >
                            <i className={`bi ${p.editando ? 'bi-floppy2-fill' : 'bi-pencil-square'}`}></i>
                          </button>
                          {p.editando ? (
                            <button className="btn-cancelar" title="Cancelar edición"
                                    onClick={e => { e.stopPropagation(); editarParametro(index); }}>
                              <i className="bi bi-x"></i>
                            </button>
                          ) : (
                            <button className="btn-eliminar" title="Eliminar parámetro"
                                    onClick={e => { e.stopPropagation(); eliminarParametro(p.id); }}>
                              <i className="bi bi-trash-fill"></i>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              {/* === MISMA FILA DE BOTONES + FILTROS QUE EN PARAMETRO→SUBSISTEMAS === */}
              <div className="grupo-btn-row grupo-btn-row--rel">
                <button type="button" className={`btn-grupo ${grupoActivo('2') ? 'activo' : ''}`} onClick={() => handleGrupoBtn('2')}>
                  <div className="d-flex gap-1"><p className="bold">200</p> Propulsión</div>
                </button>
                <button type="button" className={`btn-grupo ${grupoActivo('3') ? 'activo' : ''}`} onClick={() => handleGrupoBtn('3')}>
                  <div className="d-flex gap-1"><p className="bold">300</p> Planta eléctrica</div>
                </button>
                <button type="button" className={`btn-grupo ${grupoActivo('5') ? 'activo' : ''}`} onClick={() => handleGrupoBtn('5')}>
                  <div className="d-flex gap-1"><p className="bold">500</p> Sistemas auxiliares</div>
                </button>

                <div className="filtros-wrapper">
                  <button type="button" className="btn-filtros" onClick={toggleFiltros}>
                    <i className="bi bi-funnel-fill" />
                  </button>
                  {filtrosAbiertos && (
                    <div className="dropdown-filtros" tabIndex={0} onBlur={cerrarFiltros}>
                      <div style={{ marginBottom: '0.5rem' }}>
                        <label style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 3, display: 'block' }}>Filtrar por subgrupo</label>
                        <select value={selectedSubgrupo} onChange={handleSubgrupoChange} disabled={!selectedGrupo} style={{ width: '100%' }}>
                          <option value="">Todos los subgrupos</option>
                          {subgrupos.map(sg => (
                            <option key={sg.id} value={sg.id}>{sg.numero_de_referencia} - {sg.descripcion}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 3, display: 'block' }}>Filtrar por sistema</label>
                        <select value={selectedSistema} onChange={handleSistemaChange} disabled={!selectedSubgrupo} style={{ width: '100%' }}>
                          <option value="">Todos los sistemas</option>
                          {sistemas.map(s => (
                            <option key={s.id} value={s.id}>{s.numero_de_referencia} - {s.descripcion}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="subsistemas-lista">
                {subsistemas && Array.isArray(subsistemas) ? (
                  subsistemas.map(ss => (
                    <label key={ss.id} className="rel-row">
                      <input
                        type="checkbox"
                        name="subsistema"
                        className="form-check-input m-0 align-middle table-selectable-check"
                        onChange={() => seleccionarSubsistema(ss)}
                      />
                      <span className="rel-col-text">
                        {ss.numero_de_referencia} - {ss.descripcion}
                      </span>
                    </label>
                  ))
                ) : (
                  <p style={{ fontStyle: 'italic' }}>No hay subsistemas disponibles o la respuesta no es válida.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Botón cambiar dirección de relación */}
      <div className="swap-col">
        <button title="Cambiar dirección de relación" className="btn-swap"
          onClick={() => {
            setModoDeRelacion(prev => (prev === 'parametro' ? 'subsistema' : 'parametro'));
            setParametroActivo(null);
            setSubsistemaActivo(null);
            setSubsistemasSeleccionados([]);
            setParametrosRelacionados([]);
          }}>
          <i className="bi bi-arrow-left-right"></i>
        </button>
      </div>

      {/* Columna derecha: relación */}
      <div className="rel-panel rounded-2 p-3">
        <div className="relacion-header">
          <h5 className="page-title mb-0">
            {modoDeRelacion === 'parametro' ? 'Relación con Subsistemas' : 'Relación con Parámetros'}
          </h5>

          {/* Botón fijo en header, solo se muestra si hay selección */}
          {(modoDeRelacion === 'parametro' ? !!parametroActivo : !!subsistemaActivo) && (
            <div className="d-flex justify-content-end">
              <button
                onClick={modoDeRelacion === 'parametro' ? guardarRelaciones : guardarRelacionesSubsistema}
                className="btn-agregar"
              >
                <i className="bi bi-floppy2-fill"></i> Guardar Relaciones
              </button>
            </div>
          )}
        </div>

        {modoDeRelacion === 'parametro' ? (
          parametroActivo ? (
            <>
              <p className="fw-bold">
                Parámetro seleccionado: <span className="texto-resaltado">{parametroActivo.nombre}</span>
              </p>

              <div className="grupo-btn-row grupo-btn-row--rel">
                <button type="button" className={`btn-grupo ${grupoActivo('2') ? 'activo' : ''}`} onClick={() => handleGrupoBtn('2')}>
                  <div className="d-flex gap-1"><p className="bold">200</p> Propulsión</div>
                </button>
                <button type="button" className={`btn-grupo ${grupoActivo('3') ? 'activo' : ''}`} onClick={() => handleGrupoBtn('3')}>
                  <div className="d-flex gap-1"><p className="bold">300</p> Planta eléctrica</div>
                </button>
                <button type="button" className={`btn-grupo ${grupoActivo('5') ? 'activo' : ''}`} onClick={() => handleGrupoBtn('5')}>
                  <div className="d-flex gap-1"><p className="bold">500</p> Sistemas auxiliares</div>
                </button>

                <div className="filtros-wrapper">
                  <button type="button" className="btn-filtros" onClick={toggleFiltros}>
                    <i className="bi bi-funnel-fill" />
                  </button>
                  {filtrosAbiertos && (
                    <div className="dropdown-filtros" tabIndex={0} onBlur={cerrarFiltros}>
                      <div style={{ marginBottom: '0.5rem' }}>
                        <label style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 3, display: 'block' }}>Filtrar por subgrupo</label>
                        <select value={selectedSubgrupo} onChange={handleSubgrupoChange} disabled={!selectedGrupo} style={{ width: '100%' }}>
                          <option value="">Todos los subgrupos</option>
                          {subgrupos.map(sg => (
                            <option key={sg.id} value={sg.id}>{sg.numero_de_referencia} - {sg.descripcion}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 3, display: 'block' }}>Filtrar por sistema</label>
                        <select value={selectedSistema} onChange={handleSistemaChange} disabled={!selectedSubgrupo} style={{ width: '100%' }}>
                          <option value="">Todos los sistemas</option>
                          {sistemas.map(s => (
                            <option key={s.id} value={s.id}>{s.numero_de_referencia} - {s.descripcion}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="subsistemas-lista">
                {subsistemas && Array.isArray(subsistemas) ? (
                  subsistemas.map(ss => (
                    <label key={ss.id} className="rel-row">
                      <input
                        type="checkbox"
                        className="form-check-input m-0 align-middle table-selectable-check"
                        checked={subsistemasSeleccionados.includes(Number(ss.id))}
                        onChange={() => toggleRelacionSubsistema(Number(ss.id))}
                      />
                      <span className="rel-col-text">
                        {ss.numero_de_referencia} - {ss.descripcion}
                      </span>
                    </label>
                  ))
                ) : (
                  <p style={{ fontStyle: 'italic' }}>No hay subsistemas disponibles o la respuesta no es válida.</p>
                )}
              </div>

            </>
          ) : (
            <p style={{ fontStyle: 'italic' }}>Selecciona un parámetro para ver y asociar subsistemas.</p>
          )
        ) : (
          subsistemaActivo ? (
            <>
              <p className="fw-bold">
                Subsistema seleccionado: <span className="texto-resaltado">{subsistemaActivo.descripcion}</span>
              </p>

              <div className="subsistemas-lista">
                {parametros && Array.isArray(parametros) ? (
                  parametros.map(p => (
                    <label key={p.id} className="rel-row">
                      <input
                        type="checkbox"
                        className="form-check-input m-0 align-middle table-selectable-check"
                        checked={parametrosRelacionados.includes(p.id)}
                        onChange={() => toggleRelacionParametro(p.id)}
                      />
                      <span className="rel-col-text">
                        {p.nombre} ({p.unidad})
                      </span>
                    </label>
                  ))
                ) : (
                  <p style={{ fontStyle: 'italic' }}>No hay parámetros disponibles.</p>
                )}
              </div>

            </>
          ) : (
            <p style={{ fontStyle: 'italic' }}>Selecciona un subsistema para ver y asociar parámetros.</p>
          )
        )}
      </div>
    </div>
  </div>
);


};

export default GestionParametros;
