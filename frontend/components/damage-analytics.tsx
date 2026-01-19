"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

interface DamageAnalyticsProps {
  selectedInspection: string | null
}

const damageData: Record<string, typeof damageTypes> = {
  "INS-2024-0847": [
    { type: "Corrosión", count: 145, percentage: 42, severity: "alta" },
    { type: "Grietas Estructurales", count: 89, percentage: 26, severity: "crítica" },
    { type: "Deterioro de Pintura", count: 67, percentage: 19, severity: "media" },
    { type: "Abolladuras e Impacto", count: 45, percentage: 13, severity: "baja" },
  ],
  "INS-2024-0846": [
    { type: "Grietas Estructurales", count: 198, percentage: 51, severity: "crítica" },
    { type: "Corrosión", count: 112, percentage: 29, severity: "alta" },
    { type: "Ruptura del Casco", count: 47, percentage: 12, severity: "crítica" },
    { type: "Deterioro de Pintura", count: 31, percentage: 8, severity: "media" },
  ],
  "INS-2024-0845": [
    { type: "Deterioro de Pintura", count: 167, percentage: 58, severity: "baja" },
    { type: "Rayones Menores", count: 78, percentage: 27, severity: "baja" },
    { type: "Corrosión", count: 32, percentage: 11, severity: "media" },
    { type: "Abolladuras e Impacto", count: 11, percentage: 4, severity: "baja" },
  ],
  "INS-2024-0844": [
    { type: "Grietas Estructurales", count: 234, percentage: 47, severity: "crítica" },
    { type: "Corrosión", count: 156, percentage: 31, severity: "crítica" },
    { type: "Deformación del Casco", count: 89, percentage: 18, severity: "alta" },
    { type: "Fallas de Soldadura", count: 20, percentage: 4, severity: "crítica" },
  ],
}

const damageTypes = [
  { type: "Corrosión", count: 145, percentage: 42, severity: "alta" },
  { type: "Grietas Estructurales", count: 89, percentage: 26, severity: "crítica" },
  { type: "Deterioro de Pintura", count: 67, percentage: 19, severity: "media" },
  { type: "Abolladuras e Impacto", count: 45, percentage: 13, severity: "baja" },
]

export function DamageAnalytics({ selectedInspection }: DamageAnalyticsProps) {
  const currentDamage = selectedInspection ? damageData[selectedInspection] || damageTypes : damageTypes

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribución de Daños</CardTitle>
        <CardDescription>Análisis por tipo de daño y severidad</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {currentDamage.map((damage, index) => (
          <div key={index} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium">{damage.type}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    damage.severity === "crítica"
                      ? "bg-destructive/10 text-destructive"
                      : damage.severity === "alta"
                        ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                        : damage.severity === "media"
                          ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                          : "bg-green-500/10 text-green-600 dark:text-green-400"
                  }`}
                >
                  {damage.severity}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{damage.count} casos</span>
                <span className="text-sm font-semibold min-w-[3rem] text-right">{damage.percentage}%</span>
              </div>
            </div>
            <Progress value={damage.percentage} className="h-2" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
