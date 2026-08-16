// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import RondaReminder from './components/RondaReminder';
import Rondas from './components/Rondas';
import SWBS from './components/SWBS';
import EquipoForm from './components/EquipoForm';
import GestionParametros from './components/GestionParametros';
import RondaEquipo from './components/RondaEquipo';
import BuqueForm from './components/BuqueForm';
import AIInspection from './components/AIInspection';

import './App.css';

function App() {
  return (
    <Router>
      <div className="page">
        <Navbar />
        <div className="page-wrapper">
          <RondaReminder />
          <div className="page-body">
            <Routes>
              <Route path="/" element={<Navigate to="/rondas" replace />} />
              <Route path="/rondas" element={<Rondas />} />
              <Route path="/buque/nuevo" element={<BuqueForm />} />
              <Route path="/buque/:id/editar" element={<BuqueForm />} />
              <Route path="/ronda/:equipoId" element={<RondaEquipo />} />
              <Route path="/gestion-configuracion" element={<SWBS />} />
              <Route path="/gestion_parametros" element={<GestionParametros />} />
              <Route path="/equipo" element={<EquipoForm />} />
              <Route path="/equipo/:equipoId" element={<EquipoForm />} />
              <Route path="/ai-inspection" element={<AIInspection />} />
              <Route path="/ai-inspection/nueva" element={<AIInspection />} />
              <Route path="/ai-inspection/:inspeccionId/fotos" element={<AIInspection />} />
              <Route path="/ai-inspection/:inspeccionId/resultados" element={<AIInspection />} />
              <Route path="/ai-inspection/historial" element={<AIInspection />} />
              <Route path="*" element={<Navigate to="/rondas" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </Router>
  );
}

export default App;
