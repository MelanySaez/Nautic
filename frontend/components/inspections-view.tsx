"use client"

import type React from "react"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronRight, Ship, MapPin, Upload, Check, Trash2, X, FileImage, AlertCircle } from "lucide-react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"

interface Zone {
  id: string
  name: string
}

interface ShipData {
  id: string
  name: string
  zones: Zone[]
}

const shipsData: ShipData[] = [
  {
    id: "ship-4",
    name: "Barco 4",
    zones: [
      { id: "t5", name: "Zona T5" },
      { id: "t6", name: "Zona T6" },
    ],
  },
  {
    id: "ship-5",
    name: "Barco 5",
    zones: [
      { id: "f7", name: "Zona F7" },
      { id: "f8", name: "Zona F8" },
    ],
  },
  {
    id: "ship-7",
    name: "Barco 7",
    zones: [
      { id: "a1", name: "Zona A1" },
      { id: "a2", name: "Zona A2" },
      { id: "a3", name: "Zona A3" },
    ],
  },
]

export function InspectionsView() {
  const router = useRouter()
  const [expandedShips, setExpandedShips] = useState<string[]>(["ship-4"])
  const [selectedZone, setSelectedZone] = useState<{ shipId: string; zoneId: string } | null>({
    shipId: "ship-4",
    zoneId: "t5",
  })

  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadComplete, setUploadComplete] = useState(false)
  const [showDamageClassification, setShowDamageClassification] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [selectedDamage, setSelectedDamage] = useState<number | null>(null)
  const [selectedImage, setSelectedImage] = useState<{ url: string; name: string; index: number } | null>(null)

  const toggleShip = (shipId: string) => {
    setExpandedShips((prev) => (prev.includes(shipId) ? prev.filter((id) => id !== shipId) : [...prev, shipId]))
  }

  const selectZone = (shipId: string, zoneId: string) => {
    setSelectedZone({ shipId, zoneId })
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    setSelectedFiles(Array.from(files))
    setIsUploading(true)
    setUploadProgress(0)
    setUploadComplete(false)

    // Simulate upload progress
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          setIsUploading(false)
          setUploadComplete(true)
          return 100
        }
        return prev + 10
      })
    }, 200)
  }

  const handleApply = () => {
    setShowDamageClassification(true)
  }

  const handleDeleteImages = () => {
    setSelectedFiles([])
    setUploadProgress(0)
    setIsUploading(false)
    setUploadComplete(false)
    setShowDamageClassification(false)
  }

  const handleDamageSelect = (damageId: number) => {
    setSelectedDamage(damageId)
    setSelectedImage(null)
  }

  const handleImageSelect = (url: string, name: string, index: number) => {
    setSelectedImage({ url, name, index })
  }

  const handleCloseViewer = () => {
    setSelectedImage(null)
  }

  const damageImages: Record<number, Array<{ url: string; name: string }>> = {
    1: [
      { url: "/corrosion-damage-ship-hull.jpg", name: "Corrosión_001.jpg" },
      { url: "/rust-corrosion-metal-surface.jpg", name: "Corrosión_002.jpg" },
      { url: "/severe-corrosion-steel.jpg", name: "Corrosión_003.jpg" },
      { url: "/oxidation-damage-metal.jpg", name: "Corrosión_004.jpg" },
    ],
    2: [
      { url: "/crack-in-ship-hull.jpg", name: "Grieta_001.jpg" },
      { url: "/structural-crack-metal.jpg", name: "Grieta_002.jpg" },
      { url: "/fracture-damage-steel.jpg", name: "Grieta_003.jpg" },
    ],
    3: [
      { url: "/deformation-ship-structure.jpg", name: "Deformación_001.jpg" },
      { url: "/bent-metal-hull.jpg", name: "Deformación_002.jpg" },
      { url: "/warped-steel-surface.jpg", name: "Deformación_003.jpg" },
    ],
    4: [
      { url: "/paint-deterioration-ship.jpg", name: "Pintura_001.jpg" },
      { url: "/paint-peeling-metal-surface.jpg", name: "Pintura_002.jpg" },
      { url: "/coating-damage-hull.jpg", name: "Pintura_003.jpg" },
      { url: "/paint-wear-ship-exterior.jpg", name: "Pintura_004.jpg" },
      { url: "/paint-degradation-marine.jpg", name: "Pintura_005.jpg" },
    ],
  }

  const damageCategories = [
    {
      id: 1,
      category: "Corrosión",
      severity: "Alta",
      count: 12,
      color: "bg-red-500",
    },
    {
      id: 2,
      category: "Grietas",
      severity: "Media",
      count: 8,
      color: "bg-orange-500",
    },
    {
      id: 3,
      category: "Deformaciones",
      severity: "Baja",
      count: 5,
      color: "bg-yellow-500",
    },
    {
      id: 4,
      category: "Desgaste de Pintura",
      severity: "Media",
      count: 15,
      color: "bg-blue-500",
    },
  ]

  return (
    <div className="grid grid-cols-[320px_1fr] gap-6 h-[calc(100vh-200px)]">
      {/* Left Panel - Ships and Zones */}
      <Card className="p-6 overflow-y-auto shadow-lg border-2">
        <div className="flex items-center gap-2 mb-6">
          <Ship className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-lg">Mis Barcos y Zonas</h3>
        </div>
        <div className="space-y-2">
          {shipsData.map((ship) => {
            const isExpanded = expandedShips.includes(ship.id)
            return (
              <div key={ship.id} className="space-y-1">
                <button
                  onClick={() => toggleShip(ship.id)}
                  className="flex items-center gap-2 w-full p-3 hover:bg-accent rounded-lg transition-all hover:shadow-sm"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <Ship className="h-4 w-4 text-primary" />
                  <span className="font-medium">{ship.name}</span>
                </button>
                {isExpanded && (
                  <div className="ml-6 space-y-1 border-l-2 border-muted pl-4">
                    {ship.zones.map((zone) => {
                      const isSelected = selectedZone?.shipId === ship.id && selectedZone?.zoneId === zone.id
                      return (
                        <button
                          key={zone.id}
                          onClick={() => selectZone(ship.id, zone.id)}
                          className={`flex items-center gap-2 w-full p-2.5 rounded-lg transition-all ${
                            isSelected
                              ? "bg-primary text-primary-foreground shadow-md"
                              : "hover:bg-accent hover:shadow-sm"
                          }`}
                        >
                          <MapPin className="h-3.5 w-3.5" />
                          <span className="text-sm font-medium">{zone.name}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      {/* Right Panel - Action Buttons and Upload Interface */}
      <div className="space-y-6">
        <div className="flex gap-4">
          <div className="flex-1">
            <input
              type="file"
              id="file-upload"
              className="hidden"
              multiple
              accept="image/*"
              onChange={handleFileUpload}
            />
            <label htmlFor="file-upload" className="block">
              <Button
                className="w-full shadow-md hover:shadow-lg transition-shadow bg-transparent"
                variant="outline"
                size="lg"
                asChild
              >
                <span className="flex items-center justify-center gap-2">
                  <Upload className="h-5 w-5" />
                  <span className="font-semibold">Diagnóstico</span>
                </span>
              </Button>
            </label>
          </div>
          <Button
            onClick={() => router.push('/ship_hull_report')}
            className="flex-1 shadow-md hover:shadow-lg transition-shadow bg-transparent"
            variant="outline"
            size="lg"
          >
            <FileImage className="h-5 w-5 mr-2" />
            <span className="font-semibold">Generar Reportes</span>
          </Button>
          <Button
            className="flex-1 shadow-md hover:shadow-lg transition-shadow bg-transparent"
            variant="outline"
            size="lg"
          >
            <AlertCircle className="h-5 w-5 mr-2" />
            <span className="font-semibold">Exportar Datos</span>
          </Button>
        </div>

        {(isUploading || uploadComplete) && (
          <Card className="p-6 shadow-lg border-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <Upload className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold text-lg">Subir Imágenes</h3>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground font-medium">
                    {selectedFiles.length} {selectedFiles.length === 1 ? "imagen" : "imágenes"} seleccionada(s)
                  </span>
                  <span className="font-bold text-primary">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-3" />
              </div>

              {uploadComplete && (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 dark:bg-green-950 p-3 rounded-lg">
                  <Check className="h-5 w-5" />
                  <span className="font-medium">Carga completada exitosamente</span>
                </div>
              )}

              {uploadComplete && !showDamageClassification && (
                <div className="flex gap-2 pt-2">
                  <Button onClick={handleApply} className="flex-1 shadow-md hover:shadow-lg" size="lg">
                    <Check className="h-4 w-4 mr-2" />
                    Aplicar
                  </Button>
                  <Button
                    onClick={handleDeleteImages}
                    variant="destructive"
                    className="flex-1 shadow-md hover:shadow-lg"
                    size="lg"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Borrar Imágenes
                  </Button>
                </div>
              )}
            </div>
          </Card>
        )}

        {showDamageClassification && !selectedDamage && (
          <Card className="p-6 shadow-lg border-2">
            <div className="grid grid-cols-2 gap-4">
              {damageCategories.map((damage) => (
                <Card
                  key={damage.id}
                  className="p-5 hover:shadow-xl transition-all cursor-pointer border-2 hover:border-primary/50 hover:scale-[1.02]"
                  onClick={() => handleDamageSelect(damage.id)}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h4 className="font-semibold text-base mb-1">{damage.category}</h4>
                      <Badge variant="secondary" className="text-xs">
                        Severidad: {damage.severity}
                      </Badge>
                    </div>
                    <div className={`w-4 h-4 rounded-full ${damage.color} shadow-md`} />
                  </div>
                  <div className="text-3xl font-bold text-primary">{damage.count}</div>
                  <p className="text-xs text-muted-foreground mt-1 font-medium">daños detectados</p>
                </Card>
              ))}
            </div>
          </Card>
        )}

        {showDamageClassification && selectedDamage && !selectedImage && (
          <Card className="p-6 shadow-lg border-2">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full ${damageCategories.find((d) => d.id === selectedDamage)?.color} shadow-md`}
                />
                <h3 className="font-semibold text-lg">
                  {damageCategories.find((d) => d.id === selectedDamage)?.category} - Imágenes
                </h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedDamage(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {damageImages[selectedDamage]?.map((img, index) => (
                <Card
                  key={index}
                  className="overflow-hidden cursor-pointer hover:shadow-xl transition-all border-2 hover:border-primary/50 hover:scale-[1.03]"
                  onClick={() => handleImageSelect(img.url, img.name, index)}
                >
                  <div className="relative group">
                    <img src={img.url || "/placeholder.svg"} alt={img.name} className="w-full h-40 object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  </div>
                  <div className="p-3 bg-muted/50">
                    <p className="text-xs font-medium truncate">{img.name}</p>
                  </div>
                </Card>
              ))}
            </div>
          </Card>
        )}

        {selectedImage && selectedDamage && (
          <Card className="p-6 shadow-lg border-2">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold text-xl">Detalle de Inspección</h3>
              <Button variant="ghost" size="sm" onClick={handleCloseViewer}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-[1fr_400px] gap-6">
              {/* Left - Image */}
              <div className="space-y-3">
                <Card className="overflow-hidden shadow-md border-2">
                  <img
                    src={selectedImage.url || "/placeholder.svg"}
                    alt={selectedImage.name}
                    className="w-full h-auto"
                  />
                </Card>
                <div className="flex items-center gap-2 px-2">
                  <FileImage className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium text-muted-foreground">{selectedImage.name}</p>
                </div>
              </div>

              {/* Right - Inspection Information */}
              <Card className="p-5 space-y-5 shadow-md border-2">
                <div>
                  <h4 className="font-semibold mb-4 text-base flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-primary" />
                    Información de la Inspección
                  </h4>
                  <div className="space-y-3 text-sm">
                    <div className="p-3 rounded-lg bg-muted/50">
                      <span className="text-muted-foreground text-xs font-medium">Tipo de Daño:</span>
                      <p className="font-semibold mt-1">
                        {damageCategories.find((d) => d.id === selectedDamage)?.category}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <span className="text-muted-foreground text-xs font-medium">Severidad:</span>
                      <p className="font-semibold mt-1">
                        <Badge variant="secondary">
                          {damageCategories.find((d) => d.id === selectedDamage)?.severity}
                        </Badge>
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <span className="text-muted-foreground text-xs font-medium">Fecha de Inspección:</span>
                      <p className="font-semibold mt-1">15 Dic 2024</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <span className="text-muted-foreground text-xs font-medium">Inspector:</span>
                      <p className="font-semibold mt-1">Carlos Méndez</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <span className="text-muted-foreground text-xs font-medium">Ubicación:</span>
                      <p className="font-semibold mt-1">
                        {shipsData.find((s) => s.id === selectedZone?.shipId)?.name} -{" "}
                        {
                          shipsData
                            .find((s) => s.id === selectedZone?.shipId)
                            ?.zones.find((z) => z.id === selectedZone?.zoneId)?.name
                        }
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t-2">
                  <h4 className="font-semibold mb-3 text-sm">Observaciones</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed p-3 rounded-lg bg-muted/30">
                    Se detectó daño estructural que requiere atención. Se recomienda realizar seguimiento y evaluar la
                    necesidad de reparación en el corto plazo.
                  </p>
                </div>

                <div className="pt-4 border-t-2">
                  <h4 className="font-semibold mb-3 text-sm">Dimensiones del Daño</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between p-2 rounded-lg bg-muted/30">
                      <span className="text-muted-foreground">Área afectada:</span>
                      <span className="font-bold">0.42 m²</span>
                    </div>
                    <div className="flex justify-between p-2 rounded-lg bg-muted/30">
                      <span className="text-muted-foreground">Profundidad máx:</span>
                      <span className="font-bold">3.2 mm</span>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
