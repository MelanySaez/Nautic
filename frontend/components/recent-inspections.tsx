"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Ship, Calendar, User, ArrowRight } from 'lucide-react'

interface RecentInspectionsProps {
  selectedInspection: string | null
  onSelectInspection: (id: string) => void
}

export function RecentInspections({ selectedInspection, onSelectInspection }: RecentInspectionsProps) {
  const inspections = [
    {
      id: "INS-2024-0847",
      vessel: "Barco 1",
      zone: "Zona A2",
      inspector: "John Martinez",
      date: "2024-01-28",
      status: "completada",
      severity: "media",
    },
    {
      id: "INS-2024-0846",
      vessel: "Barco 2",
      zone: "Zona B3",
      inspector: "Sarah Chen",
      date: "2024-01-27",
      status: "en-progreso",
      severity: "alta",
    },
    {
      id: "INS-2024-0845",
      vessel: "Barco 2",
      zone: "Zona B4",
      inspector: "Michael Brown",
      date: "2024-01-26",
      status: "completada",
      severity: "baja",
    },
    {
      id: "INS-2024-0844",
      vessel: "Barco 3",
      zone: "Zona D2",
      inspector: "Emma Wilson",
      date: "2024-01-25",
      status: "revisión-pendiente",
      severity: "crítica",
    },
  ]

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>
              Inspecciones Recientes
              {selectedInspection && (
                <span className="ml-3 text-primary">
                  - {inspections.find(i => i.id === selectedInspection)?.vessel} ({inspections.find(i => i.id === selectedInspection)?.zone})
                </span>
              )}
            </CardTitle>
            <CardDescription>Últimos reportes y evaluaciones de inspección del casco</CardDescription>
          </div>
          <Button variant="outline" size="sm">
            Ver Todas
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {inspections.map((inspection) => (
            <div
              key={inspection.id}
              onClick={() => onSelectInspection(inspection.id)}
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors cursor-pointer ${
                selectedInspection === inspection.id ? 'ring-2 ring-primary bg-accent/10' : ''
              }`}
            >
              <div className="flex flex-col gap-2 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm text-muted-foreground">{inspection.zone}</span>
                  <Badge
                    variant={
                      inspection.status === "completada"
                        ? "default"
                        : inspection.status === "en-progreso"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {inspection.status.replace("-", " ")}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      inspection.severity === "crítica"
                        ? "border-destructive text-destructive"
                        : inspection.severity === "alta"
                          ? "border-orange-500 text-orange-600 dark:text-orange-400"
                          : inspection.severity === "media"
                            ? "border-yellow-500 text-yellow-600 dark:text-yellow-400"
                            : "border-green-500 text-green-600 dark:text-green-400"
                    }
                  >
                    {inspection.severity}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1.5">
                    <Ship className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{inspection.vessel}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span>{inspection.inspector}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>{inspection.date}</span>
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="sm">
                Ver Detalles
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
