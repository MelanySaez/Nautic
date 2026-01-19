"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface InspectionOverviewProps {
  selectedInspection: string | null
}

const inspectionData: Record<string, typeof stats> = {
  "INS-2024-0847": [
    { label: "Total de Inspecciones", value: "1,247", change: "+12.5%", trend: "up", icon: CheckCircle2 },
    { label: "Problemas Críticos", value: "23", change: "-8.3%", trend: "down", icon: AlertTriangle },
    { label: "Revisiones Pendientes", value: "45", change: "+5.2%", trend: "up", icon: TrendingUp },
    { label: "Tasa de Finalización", value: "94.2%", change: "+2.1%", trend: "up", icon: TrendingUp },
  ],
  "INS-2024-0846": [
    { label: "Total de Inspecciones", value: "892", change: "+18.3%", trend: "up", icon: CheckCircle2 },
    { label: "Problemas Críticos", value: "41", change: "+15.7%", trend: "up", icon: AlertTriangle },
    { label: "Revisiones Pendientes", value: "32", change: "-12.4%", trend: "down", icon: TrendingDown },
    { label: "Tasa de Finalización", value: "87.5%", change: "-3.8%", trend: "down", icon: TrendingDown },
  ],
  "INS-2024-0845": [
    { label: "Total de Inspecciones", value: "1,456", change: "+7.2%", trend: "up", icon: CheckCircle2 },
    { label: "Problemas Críticos", value: "12", change: "-22.1%", trend: "down", icon: AlertTriangle },
    { label: "Revisiones Pendientes", value: "18", change: "-9.8%", trend: "down", icon: TrendingDown },
    { label: "Tasa de Finalización", value: "98.7%", change: "+4.5%", trend: "up", icon: TrendingUp },
  ],
  "INS-2024-0844": [
    { label: "Total de Inspecciones", value: "743", change: "+9.1%", trend: "up", icon: CheckCircle2 },
    { label: "Problemas Críticos", value: "67", change: "+31.2%", trend: "up", icon: AlertTriangle },
    { label: "Revisiones Pendientes", value: "89", change: "+24.6%", trend: "up", icon: TrendingUp },
    { label: "Tasa de Finalización", value: "76.3%", change: "-8.9%", trend: "down", icon: TrendingDown },
  ],
}

const stats = [
  { label: "Total de Inspecciones", value: "1,247", change: "+12.5%", trend: "up", icon: CheckCircle2 },
  { label: "Problemas Críticos", value: "23", change: "-8.3%", trend: "down", icon: AlertTriangle },
  { label: "Revisiones Pendientes", value: "45", change: "+5.2%", trend: "up", icon: TrendingUp },
  { label: "Tasa de Finalización", value: "94.2%", change: "+2.1%", trend: "up", icon: TrendingUp },
]

export function InspectionOverview({ selectedInspection }: InspectionOverviewProps) {
  const currentStats = selectedInspection ? inspectionData[selectedInspection] || stats : stats

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen de Inspección</CardTitle>
        <CardDescription>Métricas clave para el período actual</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentStats.map((stat, index) => {
          const Icon = stat.icon
          return (
            <div
              key={index}
              className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-lg ${
                    stat.label === "Problemas Críticos" ? "bg-destructive/10" : "bg-primary/10"
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 ${stat.label === "Problemas Críticos" ? "text-destructive" : "text-primary"}`}
                  />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
              </div>
              <Badge variant={stat.trend === "up" ? "default" : "secondary"} className="gap-1">
                {stat.trend === "up" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {stat.change}
              </Badge>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
