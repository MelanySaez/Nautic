import { useEffect, useState } from 'react'
import { Icon } from '../ui/Icon'
import { applyTheme, readInitialTheme, type Theme } from './theme'

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readInitialTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Activar modo claro' : 'Activar modo oscuro'}
      className="inline-flex size-10 items-center justify-center rounded border border-line text-ink-muted hover:border-accent hover:text-ink"
    >
      <Icon name={isDark ? 'sun' : 'moon'} />
    </button>
  )
}
