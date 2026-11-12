import type { ReactNode } from 'react'
import { ThemeToggle } from '../../shared/theme/ThemeToggle'
import { Icon } from '../../shared/ui/Icon'

/** Centered card shared by the login and the registration screens (no app bar). */
export function MarcoCuenta({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="flex w-full max-w-md items-center justify-between">
        <p className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Icon name="anchor" className="size-6 text-accent-ink" />
          Nautic
        </p>
        <ThemeToggle />
      </div>
      <main className="animar-entrada w-full max-w-md rounded-lg border border-line bg-surface p-6">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">{titulo}</h1>
        {children}
      </main>
    </div>
  )
}
