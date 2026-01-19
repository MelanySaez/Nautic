"use client"

import { Plus, FileText, Camera, Download } from 'lucide-react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface QuickActionsProps {
  showInspectionActions?: boolean
}

export function QuickActions({ showInspectionActions = false }: QuickActionsProps) {
  if (showInspectionActions) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 hover:shadow-lg transition-shadow cursor-pointer group">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <Plus className="h-6 w-6 text-primary" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold">Nueva Inspección</span>
              <span className="text-sm text-muted-foreground">Iniciar evaluación</span>
            </div>
          </div>
        </Card>
        
        <Card className="p-4 hover:shadow-lg transition-shadow cursor-pointer group">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold">Generar Reporte</span>
              <span className="text-sm text-muted-foreground">Crear documento</span>
            </div>
          </div>
        </Card>

        <Card className="p-4 hover:shadow-lg transition-shadow cursor-pointer group">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <Camera className="h-6 w-6 text-primary" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold">Subir Imágenes</span>
              <span className="text-sm text-muted-foreground">Agregar fotos</span>
            </div>
          </div>
        </Card>

        <Card className="p-4 hover:shadow-lg transition-shadow cursor-pointer group">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <Download className="h-6 w-6 text-primary" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold">Exportar Datos</span>
              <span className="text-sm text-muted-foreground">Descargar archivos</span>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <Card className="p-4 hover:shadow-lg transition-shadow cursor-pointer group">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <Plus className="h-6 w-6 text-primary" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold">Nueva Inspección</span>
            <span className="text-sm text-muted-foreground">Iniciar evaluación</span>
          </div>
        </div>
      </Card>
    </div>
  )
}
