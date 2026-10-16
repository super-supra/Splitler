import { useState } from 'react'
import { fromMinor, toMinor } from '../lib/money'
import { computeSplit } from '../lib/splits'
import type { Expense, Group, SplitType } from '../lib/types'
import { useGroupCtx } from '../context'
import { Button, inputCls, Modal } from './ui'

const CATEGORIES = ['General', 'Food', 'Groceries', 'Transport', 'Stay', 'Fun', 'Bills']
const TYPES: { id: SplitType; label: string; unit: string }[] = [
  { id: 'equal', label: 'Equally', unit: '' },
  { id: 'exact', label: 'Exact', unit: '' },
  { id: 'percent', label: 'Percent', unit: '%' },
  { id: 'shares', label: 'Shares', unit: 'sh' },
]

export function ExpenseForm({ group, existing, onClose }: { group: Group; existing?: Expense; onClose: () => void }) {
  const { actions, me } = useGroupCtx()
  const [busy, setBusy] = useState(false)
  const [desc, setDesc] = useState(existing?.description ?? '')
  const [amount, setAmount] = useState(existing ? fromMinor(existing.amount) : '')
  const [payer, setPayer] = useState(existing?.payerId ?? me ?? group.members[0]?.id ?? '')
  const [date, setDate] = useState(existing?.date ?? new Date().toISOString().slice(0, 10))
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
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      setBusy(false)
    }
  }

  const preview = total && total > 0 ? (() => {
    const v = buildValues()
    return typeof v === 'string' ? null : computeSplit(total, type, v)
  })() : null

  return (
    <Modal title={existing ? 'Edit expense' : 'Add expense'} onClose={onClose}>
      <div className="space-y-3">
        <input className={inputCls} placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <input className={inputCls} placeholder="Amount" inputMode="decimal" value={amount}
            onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
          <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-slate-500">Paid by
            <select className={inputCls} value={payer} onChange={(e) => setPayer(e.target.value)}>
              {group.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-500">Category
            <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>

        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800" role="tablist">
          {TYPES.map((t) => (
            <button key={t.id} role="tab" aria-selected={type === t.id} onClick={() => setType(t.id)}
              className={`flex-1 rounded-md py-1.5 text-sm ${type === t.id ? 'bg-white shadow dark:bg-slate-700' : ''}`}>
              {t.label}
            </button>
          ))}
        </div>

        <ul className="space-y-2">
          {group.members.map((m) => (
            <li key={m.id} className="flex items-center gap-3">
              <input type="checkbox" id={`inc-${m.id}`} checked={!!included[m.id]}
                onChange={(e) => setIncluded({ ...included, [m.id]: e.target.checked })} />
              <label htmlFor={`inc-${m.id}`} className="flex-1 text-sm">{m.name}</label>
              {type !== 'equal' && included[m.id] && (
                <input className={`${inputCls} !w-24`} inputMode="decimal" aria-label={`${m.name} ${type}`}
                  placeholder={type === 'percent' ? '%' : type === 'shares' ? '1' : '0.00'}
                  value={vals[m.id] ?? ''} onChange={(e) => setVals({ ...vals, [m.id]: e.target.value })} />
              )}
              {preview?.ok && included[m.id] && (
                <span className="w-20 text-right text-xs text-slate-500">{fromMinor(preview.owed[m.id] ?? 0)}</span>
              )}
            </li>
          ))}
        </ul>

        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Save</Button>
        </div>
      </div>
    </Modal>
  )
}
