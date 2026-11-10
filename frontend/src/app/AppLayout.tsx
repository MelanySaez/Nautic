import { Outlet } from 'react-router'
import { EnlaceNav } from '../shared/ui/Enlace'
import { ThemeToggle } from '../shared/theme/ThemeToggle'
import { Icon } from '../shared/ui/Icon'

const claseEnlace = ({ isActive }: { isActive: boolean }) =>
  `label-caps rounded px-3 py-2 ${isActive ? 'bg-info-bg text-info' : 'text-ink-muted hover:text-ink'}`

export function AppLayout() {
  return (
    <div className="min-h-dvh">
      <header
        className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur"
        // Its own transition layer: the app bar stays put while the page below cross-fades.
        style={{ viewTransitionName: 'cabecera' }}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <EnlaceNav to="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Icon name="anchor" className="size-6 text-accent-ink" />
            Nautic
          </EnlaceNav>
          <nav aria-label="Principal" className="flex flex-1 items-center gap-1">
            <EnlaceNav to="/vision" className={claseEnlace}>
              Visión IA
            </EnlaceNav>
            <EnlaceNav to="/" end className={claseEnlace}>
              Inspecciones
            </EnlaceNav>
            <EnlaceNav to="/buques" className={claseEnlace}>
              Buques
            </EnlaceNav>
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
