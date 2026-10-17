import { createBrowserRouter } from 'react-router'
import { ListaInspeccionesPage } from '../inspecciones/ui/ListaInspeccionesPage'
import { AppLayout } from './AppLayout'

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [{ path: '/', element: <ListaInspeccionesPage /> }],
  },
])
