import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { BuqueDetalleRuta } from '../buques/ui/BuqueDetallePage'
import { EditarBuqueRuta } from '../buques/ui/EditarBuquePage'
import { ListaBuquesPage } from '../buques/ui/ListaBuquesPage'
import { NuevoBuquePage } from '../buques/ui/NuevoBuquePage'
import { CargaPorZonaRuta } from '../inspecciones/ui/CargaPorZonaPage'
import { BuquesConInspeccionesPage } from '../inspecciones/ui/BuquesConInspeccionesPage'
import { ListaInspeccionesRuta } from '../inspecciones/ui/ListaInspeccionesPage'
import { NuevaInspeccionPage } from '../inspecciones/ui/NuevaInspeccionPage'
import { ResultadosRuta } from '../inspecciones/ui/ResultadosPage'
import { AppLayout } from './AppLayout'
import { RedirigirACarga } from './RedirigirACarga'

export const rutas: RouteObject[] = [
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
      { path: '/buques', element: <ListaBuquesPage /> },
      { path: '/buques/nuevo', element: <NuevoBuquePage /> },
      { path: '/buques/:id', element: <BuqueDetalleRuta /> },
      { path: '/buques/:id/editar', element: <EditarBuqueRuta /> },
    ],
  },
]

export const router = createBrowserRouter(rutas)
