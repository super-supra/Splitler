import { useState } from 'react'
import { CATEGORIES } from '../lib/categories'
import { currencySymbol, todayISO } from '../lib/format'
import { formatMoney, fromMinor, toMinor } from '../lib/money'
import { computeSplit } from '../lib/splits'
import { toast } from '../lib/toast'
import type { Expense, Group, SplitType } from '../lib/types'
import { useGroupCtx } from '../context'
import { Icon } from './icons'
import { AmountInput, Avatar, Button, ErrorText, inputCls, labelCls, MemberChip, Modal, Segmented } from './ui'

const TYPES: { id: SplitType; label: string }[] = [
  { id: 'equal', label: 'Equally' },
  { id: 'exact', label: 'Exact' },
  { id: 'percent', label: '%' },
  { id: 'shares', label: 'Shares' },
]

export function ExpenseForm({ group, existing, onClose }: { group: Group; existing?: Expense; onClose: () => void }) {
  const { actions, me } = useGroupCtx()
  const [busy, setBusy] = useState(false)
  const [desc, setDesc] = useState(existing?.description ?? '')
  const [amount, setAmount] = useState(existing ? fromMinor(existing.amount) : '')
  const [payer, setPayer] = useState(existing?.payerId ?? me ?? group.members[0]?.id ?? '')
  const [date, setDate] = useState(existing?.date ?? todayISO())
  const [category, setCategory] = useState(existing?.category ?? 'General')
  const [type, setType] = useState<SplitType>(existing?.splitType ?? 'equal')
  const [included, setIncluded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(group.members.map((m) => [m.id, existing ? m.id in existing.splitValues : true])))
  // text inputs for exact / percent / shares, keyed by member id
  const [vals, setVals] = useState<Record<string, string>>(() => {
    if (!existing || existing.splitType === 'equal') return {}
    return Object.fromEntries(Object.entries(existing.splitValues).map(([id, v]) =>
      [id, existing.splitType === 'exact' ? fromMinor(v) : String(v)]))
  })
  const [error, setError] = useState('')

  const total = toMinor(amount)
  const money = (n: number) => formatMoney(n, group.currency)

  function buildValues(): Record<string, number> | string {
    const ids = group.members.filter((m) => included[m.id]).map((m) => m.id)
    if (ids.length === 0) return 'Select at least one person to split with.'
    const out: Record<string, number> = {}
    for (const id of ids) {
      if (type === 'equal') out[id] = 1
      else {
        const raw = vals[id] ?? ''
        const n = type === 'exact' ? toMinor(raw || '0') : Number(raw || 0)
        if (n === null || Number.isNaN(n)) return 'Enter valid numbers for the split.'
        out[id] = n
      }
    }
    return out
  }

  async function submit() {
    if (!desc.trim()) return setError('Add a description.')
    if (total === null || total <= 0) return setError('Enter a valid amount.')
    const values = buildValues()
    if (typeof values === 'string') return setError(values)
    const res = computeSplit(total, type, values)
    if (!res.ok) return setError(res.error)
    setBusy(true)
    try {
      await actions.saveExpense(
        { description: desc.trim(), amount: total, payerId: payer, date, category, splitType: type, splitValues: values },
        existing?.id)
      toast(existing ? 'Expense updated' : 'Expense added')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      setBusy(false)
    }
  }

  async function remove() {
    if (!existing || !confirm(`Delete "${existing.description}"?`)) return
    setBusy(true)
    try {
      await actions.deleteExpense(existing.id)
      toast('Expense deleted')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete')
      setBusy(false)
    }
  }

  const built = buildValues()
  const preview = total && total > 0 && typeof built !== 'string' ? computeSplit(total, type, built) : null

  // what's still unassigned for exact / percent splits
  let remaining: string | null = null
  if (typeof built !== 'string' && (type === 'exact' || type === 'percent')) {
    const sum = Object.values(built).reduce((a, b) => a + b, 0)
    if (type === 'exact' && total) remaining = total - sum === 0 ? null : `${money(total - sum)} left to split`
    if (type === 'percent') remaining = Math.abs(100 - sum) < 0.001 ? null : `${+(100 - sum).toFixed(2)}% left to split`
  }

  const toggle = (id: string) => setIncluded({ ...included, [id]: !included[id] })
  const allOn = group.members.every((m) => included[m.id])

  return (
    <Modal title={existing ? 'Edit expense' : 'Add expense'} onClose={onClose}
      footer={
        <div className="flex gap-2">
          {existing && (
            <Button variant="danger" aria-label="Delete expense" className="!px-4" onClick={remove} disabled={busy}>
              <Icon name="trash" size={18} />
            </Button>
          )}
          <Button className="flex-1" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      }>
      <div className="space-y-5">
        <div className="pt-2 text-center">
          <AmountInput symbol={currencySymbol(group.currency)} value={amount} onChange={setAmount} autoFocus={!existing} />
          <input className="mt-2 w-full bg-transparent text-center text-lg font-medium outline-none placeholder:text-muted"
            placeholder="What was it for?" aria-label="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>

        <div className="space-y-4 rounded-2xl bg-surface-2/50 p-4">
          <div>
            <span className={labelCls}>Paid by</span>
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5">
              {group.members.map((m) => (
                <MemberChip key={m.id} id={m.id} name={m.name} label={m.id === me ? `${m.name} (you)` : m.name} size="xs"
                  selected={payer === m.id} onClick={() => setPayer(m.id)} />
              ))}
            </div>
          </div>
          <div>
            <span className={labelCls}>Category</span>
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5">
              {CATEGORIES.map((c) => (
                <button key={c.id} type="button" aria-pressed={category === c.id} onClick={() => setCategory(c.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-sm font-medium transition-colors ${
                    category === c.id ? 'bg-accent/20 text-white ring-1 ring-accent' : 'bg-surface-2 text-muted hover:text-white'}`}>
                  <span className={`grid size-6 place-items-center rounded-full ${c.tint}`}><Icon name={c.icon} size={14} /></span>
                  {c.id}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className={labelCls}>Date</span>
            <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className={`${labelCls} !mb-0`}>Split</span>
            <button type="button" className="text-xs font-semibold text-accent"
              onClick={() => setIncluded(Object.fromEntries(group.members.map((m) => [m.id, !allOn])))}>
              {allOn ? 'Clear all' : 'Select all'}
            </button>
          </div>
          <Segmented value={type} options={TYPES} onChange={setType} className="mb-3" />
          <ul className="overflow-hidden rounded-2xl bg-surface-2/50">
            {group.members.map((m) => {
              const on = !!included[m.id]
              return (
                <li key={m.id} className="flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-0">
                  <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(m.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className={`grid size-5 shrink-0 place-items-center rounded-md border-2 transition-colors ${
                      on ? 'border-accent bg-accent text-white' : 'border-surface-3'}`}>
                      {on && <Icon name="check" size={12} strokeWidth={3} />}
                    </span>
                    <Avatar id={m.id} name={m.name} size="sm" className={on ? '' : 'opacity-40'} />
                    <span className={`truncate text-sm font-medium ${on ? '' : 'text-muted'}`}>{m.name}</span>
                  </button>
                  {type !== 'equal' && on && (
                    <input className={`${inputCls} !w-20 !rounded-lg !px-2.5 !py-1.5 text-right text-sm`} inputMode="decimal"
                      aria-label={`${m.name} ${type}`}
                      placeholder={type === 'percent' ? '%' : type === 'shares' ? '1' : '0.00'}
                      value={vals[m.id] ?? ''} onChange={(e) => setVals({ ...vals, [m.id]: e.target.value })} />
                  )}
                  <span className="w-20 shrink-0 text-right text-sm tabular-nums text-muted">
                    {on && preview?.ok ? money(preview.owed[m.id] ?? 0) : '—'}
                  </span>
                </li>
              )
            })}
          </ul>
          {remaining && <p className="mt-2 text-right text-xs font-semibold text-warn">{remaining}</p>}
        </div>

        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  )
}
