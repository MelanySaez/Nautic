import { NavLink, Outlet } from 'react-router'
import { ThemeToggle } from '../shared/theme/ThemeToggle'
import { Icon } from '../shared/ui/Icon'

export function AppLayout() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <NavLink to="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Icon name="anchor" className="size-6 text-accent-ink" />
            Nautic
          </NavLink>
          <nav aria-label="Principal" className="flex flex-1 items-center gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `label-caps rounded px-3 py-2 ${isActive ? 'bg-info-bg text-info' : 'text-ink-muted hover:text-ink'}`
              }
            >
              Inspecciones
            </NavLink>
          </nav>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 md:py-10">
        <Outlet />
      </main>
    </div>
  )
}
