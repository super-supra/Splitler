import type { IconName } from '../components/icons'

export const CATEGORIES: { id: string; icon: IconName; tint: string }[] = [
  { id: 'General', icon: 'receipt', tint: 'bg-slate-500/20 text-slate-300' },
  { id: 'Food', icon: 'food', tint: 'bg-orange-500/20 text-orange-300' },
  { id: 'Groceries', icon: 'cart', tint: 'bg-lime-500/20 text-lime-300' },
  { id: 'Transport', icon: 'car', tint: 'bg-sky-500/20 text-sky-300' },
  { id: 'Stay', icon: 'bed', tint: 'bg-fuchsia-500/20 text-fuchsia-300' },
  { id: 'Fun', icon: 'spark', tint: 'bg-yellow-500/20 text-yellow-300' },
  { id: 'Bills', icon: 'bolt', tint: 'bg-cyan-500/20 text-cyan-300' },
]

export function category(id: string) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0]
}
