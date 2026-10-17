import { createBrowserRouter } from 'react-router'
import { AppLayout } from './AppLayout'

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [{ path: '/', element: <p className="text-ink-muted">Próximamente.</p> }],
  },
])
