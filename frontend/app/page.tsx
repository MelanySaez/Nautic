"use client"

import { Header } from "@/components/header"
import { InspectionOverview } from "@/components/inspection-overview"
import { RecentInspections } from "@/components/recent-inspections"
import { DamageAnalytics } from "@/components/damage-analytics"
import { InspectionsView } from "@/components/inspections-view"
import { useEffect, useState } from "react"

export default function Page() {
  const [userName, setUserName] = useState("")
  const [activeTab, setActiveTab] = useState("Dashboard")
  const [selectedInspection, setSelectedInspection] = useState<string | null>(null)

  useEffect(() => {
    const userStr = localStorage.getItem("user")
    if (userStr) {
      const user = JSON.parse(userStr)
      setUserName(user.username)
    }
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <Header activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="container mx-auto px-4 py-8 space-y-8">
        {activeTab === "Dashboard" && (
          <div className="flex flex-col gap-3 pb-2">
            <h1 className="text-4xl font-bold tracking-tight text-balance bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text">
              {userName ? `Bienvenido, ${userName}` : "Panel de Inspección de Cascos de Barcos"}
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed max-w-3xl">
              Plataforma profesional de inspección marítima y evaluación de daños
            </p>
          </div>
        )}

        {activeTab === "Dashboard" && (
          <>
            <RecentInspections selectedInspection={selectedInspection} onSelectInspection={setSelectedInspection} />
            <div className="grid gap-6 lg:grid-cols-2">
              <InspectionOverview selectedInspection={selectedInspection} />
              <DamageAnalytics selectedInspection={selectedInspection} />
            </div>
          </>
        )}

        {activeTab === "Inspections" && <InspectionsView />}

        {activeTab === "Reports" && (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold">Reports Section</h2>
            <p className="text-muted-foreground mt-2">Coming soon...</p>
          </div>
        )}

        {activeTab === "Analytics" && (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold">Analytics Section</h2>
            <p className="text-muted-foreground mt-2">Coming soon...</p>
          </div>
        )}
      </main>
    </div>
  )
}
