import type { SVGProps } from 'react'

const paths = {
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 18l-6-6 6-6',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  share: 'M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 002 2h10a2 2 0 002-2v-5',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3',
  logout: 'M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l-5-5 5-5M5 12h11',
  clock: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
  check: 'M5 12l5 5L20 7',
  cash: 'M3 7h18v10H3zM12 15a3 3 0 100-6 3 3 0 000 6zM6 10v.01M18 14v.01',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  food: 'M7 3v8a2 2 0 002 2v8M11 3v8M7 7h4M17 3c-1.5 2-2 4-2 7h2v11',
  cart: 'M3 4h2l2.5 11h11L21 7H6.5M9 20h.01M18 20h.01',
  car: 'M5 17h14M5 17v-5l2-5h10l2 5v5M5 17v2M19 17v2M7.5 14h.01M16.5 14h.01M5 12h14',
  bed: 'M3 18V7M3 13h18v5M21 18v-3a3 3 0 00-3-3H11v1M7 11a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  spark: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
  users: 'M16 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 20v-1a4 4 0 00-3-3.9M15.5 4.1a3.5 3.5 0 010 6.8',
  ghost: 'M5 21V10a7 7 0 0114 0v11l-2.5-2-2.5 2-2-2-2 2-2.5-2zM9.5 10h.01M14.5 10h.01',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 018 0v4',
  whatsapp: 'M4 20l1.3-4A8 8 0 1112 20a8 8 0 01-4-1.1zM9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1a4 4 0 01-2-2l1-1-1-2z',
} as const

export type IconName = keyof typeof paths

export function Icon({ name, size = 20, ...p }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
      <path d={paths[name]} />
    </svg>
  )
}
