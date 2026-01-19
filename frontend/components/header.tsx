"use client"

import { Ship, Bell, User, LogOut, MapPin } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { useRouter } from 'next/navigation'
import { useEffect, useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"

interface UserSession {
  username: string
  zones: string[]
  loginTime: string
}

const ZONE_LABELS: Record<string, string> = {
  "north-atlantic": "Atlántico Norte",
  "south-atlantic": "Atlántico Sur",
  pacific: "Pacífico",
  mediterranean: "Mediterráneo",
  caribbean: "Caribe",
  "indian-ocean": "Océano Índico",
  "baltic-sea": "Mar Báltico",
  "north-sea": "Mar del Norte",
}

interface HeaderProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

export function Header({ activeTab, onTabChange }: HeaderProps) {
  const router = useRouter()
  const [user, setUser] = useState<UserSession | null>(null)

  useEffect(() => {
    const userStr = localStorage.getItem("user")
    if (userStr) {
      setUser(JSON.parse(userStr))
    } else {
      router.push("/login")
    }
  }, [router])

  const handleLogout = () => {
    localStorage.removeItem("user")
    router.push("/login")
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary">
            <Ship className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-lg leading-none">Nautic</span>
            <span className="text-xs text-muted-foreground">Pro Edition</span>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-4">
          <button
            onClick={() => onTabChange("Dashboard")}
            className={`text-sm font-medium transition-colors ${
              activeTab === "Dashboard" ? "text-primary" : "text-muted-foreground hover:text-primary"
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => onTabChange("Inspections")}
            className={`text-sm font-medium transition-colors ${
              activeTab === "Inspections" ? "text-primary" : "text-muted-foreground hover:text-primary"
            }`}
          >
            Inspections
          </button>
        </nav>

        <div className="flex items-center gap-2">
          {user && user.zones && user.zones.length > 0 && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex flex-wrap gap-1">
                {user.zones.slice(0, 2).map((zoneId) => (
                  <Badge key={zoneId} variant="secondary" className="text-xs">
                    {ZONE_LABELS[zoneId] || zoneId}
                  </Badge>
                ))}
                {user.zones.length > 2 && (
                  <Badge variant="secondary" className="text-xs">
                    +{user.zones.length - 2}
                  </Badge>
                )}
              </div>
            </div>
          )}

          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <User className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col gap-2">
                  <span>{user?.username || "Usuario"}</span>
                  {user?.zones && user.zones.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        Zonas asignadas:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {user.zones.map((zoneId) => (
                          <Badge key={zoneId} variant="secondary" className="text-xs">
                            {ZONE_LABELS[zoneId] || zoneId}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuItem>Settings</DropdownMenuItem>
              <DropdownMenuItem>Team</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4 mr-2" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
