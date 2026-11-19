import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { BuqueDetalleRuta } from '../buques/ui/BuqueDetallePage'
import { EditarBuqueRuta } from '../buques/ui/EditarBuquePage'
import { ListaBuquesPage } from '../buques/ui/ListaBuquesPage'
import { NuevoBuquePage } from '../buques/ui/NuevoBuquePage'
import { CargaPorZonaRuta } from '../inspecciones/ui/CargaPorZonaPage'
import { BuquesConInspeccionesPage } from '../inspecciones/ui/BuquesConInspeccionesPage'
import { ListaInspeccionesRuta } from '../inspecciones/ui/ListaInspeccionesPage'
import { NuevaInspeccionPage } from '../inspecciones/ui/NuevaInspeccionPage'
import { ReporteRuta } from '../inspecciones/ui/ReportePage'
import { ResultadosRuta } from '../inspecciones/ui/ResultadosPage'
import { LoginPage } from '../cuentas/ui/LoginPage'
import { RegistroPage } from '../cuentas/ui/RegistroPage'
import { RaizSesion, RequiereSesion } from '../cuentas/ui/SesionProvider'
import { AppLayout } from './AppLayout'
import { RedirigirACarga } from './RedirigirACarga'

export const rutas: RouteObject[] = [
  {
    element: <RaizSesion />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/registro', element: <RegistroPage /> },
      {
        // Every other route needs a session.
        element: <RequiereSesion />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: '/', element: <BuquesConInspeccionesPage /> },
              { path: '/inspecciones/buque/:id', element: <ListaInspeccionesRuta /> },
              { path: '/vision', element: <NuevaInspeccionPage /> },
              { path: '/vision/:id', element: <CargaPorZonaRuta /> },
              { path: '/vision/:id/resultados', element: <ResultadosRuta /> },
              { path: '/inspecciones/nueva', element: <Navigate to="/vision" replace /> },
              { path: '/inspecciones/:id/carga', element: <RedirigirACarga /> },
              { path: '/inspecciones/:id/resultados', element: <ResultadosRuta /> },
              { path: '/inspecciones/:id/reporte', element: <ReporteRuta /> },
              { path: '/buques', element: <ListaBuquesPage /> },
              { path: '/buques/nuevo', element: <NuevoBuquePage /> },
              { path: '/buques/:id', element: <BuqueDetalleRuta /> },
              { path: '/buques/:id/editar', element: <EditarBuqueRuta /> },
            ],
          },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(rutas)
