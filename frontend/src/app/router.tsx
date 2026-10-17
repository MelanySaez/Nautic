import { createBrowserRouter } from 'react-router'
import { ListaInspeccionesPage } from '../inspecciones/ui/ListaInspeccionesPage'
import { NuevaInspeccionPage } from '../inspecciones/ui/NuevaInspeccionPage'
import { AppLayout } from './AppLayout'

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <ListaInspeccionesPage /> },
      { path: '/inspecciones/nueva', element: <NuevaInspeccionPage /> },
    ],
  },
])
