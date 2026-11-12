import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { crearDependenciasFalsas, renderizarRutas } from '../test/dobles'
import { rutas } from './router'

describe('router', () => {
  it('redirects the old upload path to the Visión IA inspection', async () => {
    const { dependencias } = crearDependenciasFalsas()

    const router = renderizarRutas(rutas, dependencias, '/inspecciones/7/carga')

    expect(await screen.findByRole('heading', { name: 'ARA Almirante Brown' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/vision/7')
  })
})
