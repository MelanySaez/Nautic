import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { crearDependencias } from './app/composicion'
import { DependenciasProvider } from './app/DependenciasProvider'
import { router } from './app/router'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DependenciasProvider valor={crearDependencias()}>
      <RouterProvider router={router} />
    </DependenciasProvider>
  </StrictMode>,
)
