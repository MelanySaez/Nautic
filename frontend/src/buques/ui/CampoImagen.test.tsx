import { render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CampoImagen } from './CampoImagen'

afterEach(() => vi.restoreAllMocks())

describe('CampoImagen', () => {
  it('keeps a live preview URL under StrictMode and releases it on unmount', () => {
    let siguiente = 0
    const revocadas = new Set<string>()
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:vista-${++siguiente}`)
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => void revocadas.add(url))
    const archivo = new File(['png'], 'casco.png', { type: 'image/png' })

    const { unmount } = render(
      <StrictMode>
        <CampoImagen actual={null} eleccion={{ archivo, quitar: false }} alCambiar={() => {}} />
      </StrictMode>,
    )

    const src = screen.getByRole('img', { name: 'Vista previa de la imagen' }).getAttribute('src')!
    expect(revocadas.has(src)).toBe(false)
    unmount()
    expect(revocadas.has(src)).toBe(true)
  })

  it('names the size limit in its help text', () => {
    render(<CampoImagen actual={null} eleccion={{ archivo: null, quitar: false }} alCambiar={() => {}} />)

    expect(screen.getByLabelText('Imagen')).toHaveAccessibleDescription('JPG, PNG o WEBP, hasta 5 MB.')
  })
})
