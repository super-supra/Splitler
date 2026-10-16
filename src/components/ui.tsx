import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { onToast } from '../lib/toast'
import { Icon } from './icons'

type Variant = 'primary' | 'ghost' | 'danger' | 'icon'

export function Button({ variant = 'primary', className = '', ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const v = {
    primary: 'bg-accent text-white hover:bg-accent-hover px-5 py-3',
    ghost: 'bg-surface-2 text-white hover:bg-surface-3 px-4 py-2.5',
    danger: 'bg-neg/10 text-neg hover:bg-neg/20 px-4 py-2.5',
    icon: 'grid size-10 place-items-center bg-surface-2 text-white hover:bg-surface-3',
  }[variant]
  return (
    <button type="button" {...p}
      className={`rounded-full text-sm font-semibold transition-colors active:scale-[.98] disabled:pointer-events-none disabled:opacity-40 ${v} ${className}`} />
  )
}

export const inputCls =
  'w-full rounded-xl bg-surface-2 px-4 py-3 text-[15px] text-white placeholder:text-muted outline-none ring-accent/60 transition focus:ring-2'

export const labelCls = 'mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted'

export function Modal({ title, onClose, children, footer, dismissable = true }: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  dismissable?: boolean
}) {
  useEffect(() => {
    if (!dismissable) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [dismissable, onClose])

  return (
    <div className="animate-fade fixed inset-0 z-30 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={dismissable ? onClose : undefined}>
      <div role="dialog" aria-modal aria-label={title} onClick={(e) => e.stopPropagation()}
        className="animate-sheet flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl">
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <h2 className="text-lg font-bold">{title}</h2>
          {dismissable && (
            <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full bg-surface-2 text-muted hover:text-white">
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-surface p-4 ${className}`}>{children}</div>
}

const TONES = [
  'bg-violet-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-fuchsia-500', 'bg-lime-600',
]

function hash(s: string) {
  // FNV-1a: spreads short random ids across tones better than a plain *31 hash
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return (h ^ (h >>> 15)) >>> 0
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

export function Avatar({ id, name, size = 'md', className = '' }: {
  id: string; name: string; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string
}) {
  const s = { xs: 'size-6 text-[10px]', sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-14 text-lg' }[size]
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full font-bold text-white ${TONES[hash(id) % TONES.length]} ${s} ${className}`}>
      {initials(name)}
    </span>
  )
}

export function AvatarStack({ people, max = 5 }: { people: { id: string; name: string }[]; max?: number }) {
  const shown = people.slice(0, max)
  return (
    <div className="flex -space-x-2">
      {shown.map((p) => <Avatar key={p.id} id={p.id} name={p.name} size="sm" className="ring-2 ring-bg" />)}
      {people.length > max && (
        <span className="grid size-8 place-items-center rounded-full bg-surface-3 text-xs font-semibold ring-2 ring-bg">
          +{people.length - max}
        </span>
      )}
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange, className = '' }: {
  value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; className?: string
}) {
  return (
    <div role="tablist" className={`flex gap-1 rounded-full bg-surface-2 p-1 ${className}`}>
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)}
          className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
            value === o.id ? 'bg-white text-black' : 'text-muted hover:text-white'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-surface-3'}`}>
      <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

export function MemberChip({ id, name, label = name, selected, onClick, size = 'sm' }: {
  id: string; name: string; label?: string; selected: boolean; onClick: () => void; size?: 'xs' | 'sm'
}) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick}
      className={`flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-medium transition-colors ${
        selected ? 'bg-accent/20 text-white ring-1 ring-accent' : 'bg-surface-2 text-muted hover:text-white'}`}>
      <Avatar id={id} name={name} size={size} />
      {label}
    </button>
  )
}

/** Big centered money input that hugs its content so the currency symbol sits next to the digits. */
export function AmountInput({ symbol, value, onChange, autoFocus }: {
  symbol: string; value: string; onChange: (v: string) => void; autoFocus?: boolean
}) {
  return (
    <label className="flex items-baseline justify-center gap-1">
      <span className="text-3xl font-bold text-muted">{symbol}</span>
      <input className="min-w-[1ch] max-w-[80%] bg-transparent text-5xl font-extrabold tabular-nums outline-none placeholder:text-surface-3"
        style={{ width: `${Math.max(1, value.length) + 0.3}ch` }}
        placeholder="0" inputMode="decimal" aria-label="Amount" autoFocus={autoFocus}
        value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? <p className="rounded-xl bg-neg/10 px-3 py-2 text-sm text-neg" role="alert">{children}</p> : null
}

export function Spinner() {
  return (
    <div className="grid min-h-dvh place-items-center" aria-label="Loading">
      <span className="size-8 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
    </div>
  )
}

export function Toaster() {
  const [msg, setMsg] = useState<{ text: string; key: number } | null>(null)
  useEffect(() => onToast((text) => setMsg({ text, key: Date.now() })), [])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 2000)
    return () => clearTimeout(t)
  }, [msg])
  if (!msg) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
      <div key={msg.key} role="status"
        className="animate-sheet flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-black shadow-xl">
        <Icon name="check" size={16} /> {msg.text}
      </div>
    </div>
  )
}
