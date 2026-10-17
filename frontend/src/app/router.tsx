import { createBrowserRouter } from 'react-router'
import { CargaPorZonaRuta } from '../inspecciones/ui/CargaPorZonaPage'
import { ListaInspeccionesPage } from '../inspecciones/ui/ListaInspeccionesPage'
import { NuevaInspeccionPage } from '../inspecciones/ui/NuevaInspeccionPage'
import { ResultadosRuta } from '../inspecciones/ui/ResultadosPage'
import { AppLayout } from './AppLayout'

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <ListaInspeccionesPage /> },
      { path: '/inspecciones/nueva', element: <NuevaInspeccionPage /> },
      { path: '/inspecciones/:id/carga', element: <CargaPorZonaRuta /> },
      { path: '/inspecciones/:id/resultados', element: <ResultadosRuta /> },
    ],
  },
])
