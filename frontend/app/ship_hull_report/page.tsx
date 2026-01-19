"use client"

import React, { useState } from 'react';
import { Ship, Calendar, MapPin, AlertTriangle, CheckCircle, XCircle, Camera, FileText, User } from 'lucide-react';

export default function ShipInspectionReport() {
  const [reportData, setReportData] = useState({
    // Información General
    reportNumber: 'INS-2026-001',
    date: '2026-01-18',
    inspector: 'Juan Pérez',
    vesselName: 'MV Neptuno',
    vesselIMO: 'IMO 9123456',
    vesselType: 'Buque de Carga',
    
    // Ubicación de Inspección
    zone: 'Zona T5',
    vessel: 'Barco 4',
    location: 'Puerto de Medellín',
    
    // Condiciones de Inspección
    weatherConditions: 'Soleado, 22°C',
    seaState: 'Calma',
    
    // Resultados
    overallStatus: 'warning', // 'good', 'warning', 'critical'
    faultsDetected: 3,
    criticalFaults: 1,
    
    // Fallas Detectadas
    faults: [
      {
        id: 1,
        severity: 'critical',
        type: 'Corrosión',
        location: 'Casco - Banda de Estribor, Sección 3',
        description: 'Corrosión avanzada detectada en planchas del casco',
        dimensions: '45cm x 30cm, profundidad aprox. 3mm',
        recommendation: 'Reparación urgente requerida. Reemplazar plancha afectada.',
        images: 2
      },
      {
        id: 2,
        severity: 'warning',
        type: 'Grieta',
        location: 'Casco - Proa, Línea de flotación',
        description: 'Grieta superficial en soldadura',
        dimensions: '15cm de longitud',
        recommendation: 'Monitorear y reparar en próximo dique seco.',
        images: 1
      },
      {
        id: 3,
        severity: 'low',
        type: 'Desgaste de Pintura',
        location: 'Casco - Popa',
        description: 'Pérdida de recubrimiento anticorrosivo',
        dimensions: 'Área de 2m²',
        recommendation: 'Repintar área afectada en mantenimiento programado.',
        images: 1
      }
    ],
    
    // Notas Adicionales
    notes: 'Se recomienda programar inspección de seguimiento en 30 días para verificar evolución de grieta en proa.',
    
    // Próximos Pasos
    nextInspection: '2026-02-18',
    approvedBy: ''
  });

  const getSeverityColor = (severity) => {
    const colors = {
      critical: 'bg-red-100 text-red-800 border-red-300',
      warning: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      low: 'bg-blue-100 text-blue-800 border-blue-300'
    };
    return colors[severity] || colors.low;
  };

  const getSeverityIcon = (severity) => {
    if (severity === 'critical') return <XCircle className="w-5 h-5 text-red-600" />;
    if (severity === 'warning') return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
    return <CheckCircle className="w-5 h-5 text-blue-600" />;
  };

  const getStatusBadge = (status) => {
    const badges = {
      good: { text: 'Aprobado', color: 'bg-green-100 text-green-800' },
      warning: { text: 'Requiere Atención', color: 'bg-yellow-100 text-yellow-800' },
      critical: { text: 'Crítico', color: 'bg-red-100 text-red-800' }
    };
    const badge = badges[status] || badges.warning;
    return <span className={`px-3 py-1 rounded-full text-sm font-semibold ${badge.color}`}>{badge.text}</span>;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto bg-white shadow-lg rounded-lg">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 to-blue-700 text-white p-8 rounded-t-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Ship className="w-10 h-10" />
              <div>
                <h1 className="text-3xl font-bold">Reporte de Inspección Naval</h1>
                <p className="text-blue-200">Sistema de Diagnóstico de Cascos</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-blue-200">Reporte N°</p>
              <p className="text-xl font-bold">{reportData.reportNumber}</p>
            </div>
          </div>
        </div>

        {/* Información General */}
        <div className="p-8 border-b">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Información General
          </h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-600">Fecha de Inspección</p>
              <p className="font-semibold flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                {reportData.date}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Inspector</p>
              <p className="font-semibold flex items-center gap-2">
                <User className="w-4 h-4 text-blue-600" />
                {reportData.inspector}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Embarcación</p>
              <p className="font-semibold">{reportData.vesselName}</p>
              <p className="text-sm text-gray-500">{reportData.vesselIMO}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Tipo de Buque</p>
              <p className="font-semibold">{reportData.vesselType}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Ubicación</p>
              <p className="font-semibold flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600" />
                {reportData.location}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Zona Inspeccionada</p>
              <p className="font-semibold">{reportData.vessel} - {reportData.zone}</p>
            </div>
          </div>
        </div>

        {/* Condiciones de Inspección */}
        <div className="p-8 border-b bg-gray-50">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Condiciones de Inspección</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-600">Condiciones Climáticas</p>
              <p className="font-semibold">{reportData.weatherConditions}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Estado del Mar</p>
              <p className="font-semibold">{reportData.seaState}</p>
            </div>
          </div>
        </div>

        {/* Resumen de Resultados */}
        <div className="p-8 border-b">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Resumen de Resultados</h2>
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-sm text-gray-600 mb-2">Estado General</p>
              {getStatusBadge(reportData.overallStatus)}
            </div>
            <div className="grid grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-3xl font-bold text-blue-600">{reportData.faultsDetected}</p>
                <p className="text-sm text-gray-600">Fallas Totales</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-red-600">{reportData.criticalFaults}</p>
                <p className="text-sm text-gray-600">Críticas</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-yellow-600">{reportData.faultsDetected - reportData.criticalFaults}</p>
                <p className="text-sm text-gray-600">No Críticas</p>
              </div>
            </div>
          </div>
        </div>

        {/* Fallas Detectadas */}
        <div className="p-8 border-b">
          <h2 className="text-xl font-bold text-gray-800 mb-6">Fallas Detectadas</h2>
          <div className="space-y-6">
            {reportData.faults.map((fault) => (
              <div key={fault.id} className={`border-2 rounded-lg p-6 ${getSeverityColor(fault.severity)}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {getSeverityIcon(fault.severity)}
                    <div>
                      <h3 className="font-bold text-lg">{fault.type}</h3>
                      <p className="text-sm opacity-80">{fault.location}</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-white bg-opacity-50 rounded-full text-xs font-semibold">
                    Falla #{fault.id}
                  </span>
                </div>
                
                <div className="space-y-3 mt-4">
                  <div>
                    <p className="text-sm font-semibold opacity-80">Descripción:</p>
                    <p className="text-sm">{fault.description}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm font-semibold opacity-80">Dimensiones:</p>
                    <p className="text-sm">{fault.dimensions}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm font-semibold opacity-80">Recomendación:</p>
                    <p className="text-sm">{fault.recommendation}</p>
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm">
                    <Camera className="w-4 h-4" />
                    <span>{fault.images} imagen(es) adjunta(s)</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notas Adicionales */}
        <div className="p-8 border-b bg-gray-50">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Notas Adicionales</h2>
          <p className="text-gray-700">{reportData.notes}</p>
        </div>

        {/* Próximos Pasos */}
        <div className="p-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Próximos Pasos</h2>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-2">Próxima Inspección Programada</p>
            <p className="font-semibold text-blue-900">{reportData.nextInspection}</p>
          </div>
          
          <div className="mt-6 pt-6 border-t">
            <div className="grid grid-cols-2 gap-8">
              <div>
                <p className="text-sm text-gray-600 mb-2">Inspector</p>
                <div className="border-b-2 border-gray-400 pb-2">
                  <p className="font-semibold">{reportData.inspector}</p>
                </div>
                <p className="text-xs text-gray-500 mt-1">Firma y Fecha</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-2">Aprobado por</p>
                <div className="border-b-2 border-gray-400 pb-2 h-8"></div>
                <p className="text-xs text-gray-500 mt-1">Firma y Fecha</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-100 p-6 rounded-b-lg text-center text-sm text-gray-600">
          <p>Este reporte es confidencial y está destinado únicamente para uso interno.</p>
          <p className="mt-1">Nautic Pro Edition - Sistema de Inspección Naval</p>
        </div>
      </div>
    </div>
  );
}
