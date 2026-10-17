import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { ThemeToggle } from './ThemeToggle'

describe('ThemeToggle', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark')
  })

  it('starts in light mode when nothing is stored and the OS prefers light', () => {
    render(<ThemeToggle />)

    expect(document.documentElement).not.toHaveClass('dark')
    expect(screen.getByRole('button', { name: 'Activar modo oscuro' })).toBeInTheDocument()
  })

  it('switches to dark mode and persists the choice', async () => {
    render(<ThemeToggle />)

    await userEvent.click(screen.getByRole('button', { name: 'Activar modo oscuro' }))

    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem('nautic.theme')).toBe('dark')
    expect(screen.getByRole('button', { name: 'Activar modo claro' })).toBeInTheDocument()
  })

  it('restores a stored dark preference on mount', () => {
    localStorage.setItem('nautic.theme', 'dark')

    render(<ThemeToggle />)

    expect(document.documentElement).toHaveClass('dark')
  })
})
