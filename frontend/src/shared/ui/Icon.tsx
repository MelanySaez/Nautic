// Minimal inline SVG icon set (stroke icons, 24x24 grid). Avoids an icon-font dependency.
const PATHS = {
  anchor: 'M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 0v13m0 0c-4 0-7-3-7-7H3m9 7c4 0 7-3 7-7h2M8 11h8',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-15v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  plus: 'M12 5v14M5 12h14',
  search: 'm21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v4m8-4v4',
  photos: 'M3 7h14v13H3zM7 3h14v13M7 16l3-4 3 3 2-2 2 3',
  back: 'M19 12H5m6-6-6 6 6 6',
  upload: 'M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4',
  play: 'M7 4v16l13-8z',
  pin: 'M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  refresh: 'M20 11a8 8 0 0 0-14.9-3M4 4v4h4m-4 5a8 8 0 0 0 14.9 3M20 20v-4h-4',
  results: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  ship: 'M3 17l2 4h14l2-4-9-3-9 3Zm4-4V7h10v6M12 3v4',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, className = 'size-5' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
