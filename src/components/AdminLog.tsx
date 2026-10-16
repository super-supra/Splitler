import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type AuditAction, type AuditEntry } from '../lib/api'
import { dayLabel } from '../lib/format'
import { formatMoney } from '../lib/money'
import { toast } from '../lib/toast'
import type { Expense, Group, Settlement } from '../lib/types'
import { useGroupCtx } from '../context'
import { Icon, type IconName } from './icons'
import { Button, Modal } from './ui'

const META: Record<AuditAction, { label: string; icon: IconName; tint: string }> = {
  'group.create': { label: 'Group created', icon: 'users', tint: 'bg-accent/15 text-accent' },
  'member.add': { label: 'Member added', icon: 'users', tint: 'bg-accent/15 text-accent' },
  'expense.add': { label: 'Expense added', icon: 'plus', tint: 'bg-pos/15 text-pos' },
  'expense.update': { label: 'Expense edited', icon: 'receipt', tint: 'bg-warn/15 text-warn' },
  'expense.delete': { label: 'Expense deleted', icon: 'trash', tint: 'bg-neg/15 text-neg' },
  'expense.restore': { label: 'Expense restored', icon: 'check', tint: 'bg-pos/15 text-pos' },
  'settlement.add': { label: 'Payment recorded', icon: 'cash', tint: 'bg-pos/15 text-pos' },
  'settlement.delete': { label: 'Payment removed', icon: 'trash', tint: 'bg-neg/15 text-neg' },
  'settlement.restore': { label: 'Payment restored', icon: 'check', tint: 'bg-pos/15 text-pos' },
}

type Line = [label: string, value: string]

/** Admin-only, read-only history of every change in the group, with restore for deletes. */
export function AdminLog({ group, onClose }: { group: Group; onClose: () => void }) {
  const { actions } = useGroupCtx()
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(() => {
    api.audit(group.id).then((r) => setEntries(r.entries)).catch((e) => setError(e.message))
  }, [group.id])
  useEffect(load, [load])

  const name = (id: string) => group.members.find((m) => m.id === id)?.name ?? 'someone removed'
  const money = (n: number) => formatMoney(n, group.currency)

  function split(e: Expense): string {
    const ids = Object.keys(e.splitValues)
    if (e.splitType === 'equal') return `Equally: ${ids.map(name).join(', ')}`
    const fmt = (id: string) => {
      const v = e.splitValues[id]
      return `${name(id)} ${e.splitType === 'exact' ? money(v) : e.splitType === 'percent' ? `${v}%` : `×${v}`}`
    }
    return `${{ exact: 'Exact', percent: 'Percent', shares: 'Shares' }[e.splitType]}: ${ids.map(fmt).join(', ')}`
  }

  function expenseLines(e: Expense): Line[] {
    return [
      ['Amount', money(e.amount)], ['Paid by', name(e.payerId)], ['Date', e.date],
      ['Category', e.category], ['Split', split(e)],
    ]
  }

  function details(en: AuditEntry): { title?: string; lines: Line[] } {
    const before = en.before as Record<string, unknown> | undefined
    const after = en.after as Record<string, unknown> | undefined
    switch (en.action) {
      case 'group.create': {
        const a = after as { name: string; currency: string; members: string[] }
        return { title: a.name, lines: [['Currency', a.currency], ['People', a.members.join(', ')]] }
      }
      case 'member.add':
        return { title: (after as { name: string }).name, lines: [] }
      case 'expense.add': case 'expense.restore':
        return { title: (after as unknown as Expense).description, lines: expenseLines(after as unknown as Expense) }
      case 'expense.delete':
        return { title: (before as unknown as Expense).description, lines: expenseLines(before as unknown as Expense) }
      case 'expense.update': {
        const b = expenseLines(before as unknown as Expense)
        const a = expenseLines(after as unknown as Expense)
        const changed: Line[] = a.flatMap(([k, v], i) => (b[i][1] !== v ? [[k, `${b[i][1]} → ${v}`] as Line] : []))
        const bd = (before as unknown as Expense).description
        const ad = (after as unknown as Expense).description
        if (bd !== ad) changed.unshift(['Description', `${bd} → ${ad}`])
        return { title: ad, lines: changed.length ? changed : [['Changes', 'None (saved without changes)']] }
      }
      case 'settlement.add': case 'settlement.delete': case 'settlement.restore': {
        const s = (after ?? before) as unknown as Settlement
        const lines: Line[] = [['Amount', money(s.amount)], ['Paid on', s.date]]
        if (s.note) lines.push(['Note', s.note])
        return { title: `${name(s.fromId)} paid ${name(s.toId)}`, lines }
      }
    }
  }

  // which deletes are already undone, and which devices used more than one name
  const restored = useMemo(() => new Set((entries ?? []).flatMap((e) => (e.ref ? [e.ref] : []))), [entries])
  const namesByDevice = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const e of entries ?? []) if (e.device && e.actor) m.set(e.device, (m.get(e.device) ?? new Set()).add(e.actor))
    return m
  }, [entries])

  const isLive = (en: AuditEntry) => {
    const id = (en.before as { id: string }).id
    return en.action === 'expense.delete' ? group.expenses.some((e) => e.id === id) : group.settlements.some((s) => s.id === id)
  }

  async function restore(en: AuditEntry) {
    setBusy(en.id)
    try {
      await actions.restore(en.id)
      toast('Restored')
      load()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not restore')
    } finally {
      setBusy('')
    }
  }

  const days = useMemo(() => {
    const out: { label: string; items: AuditEntry[] }[] = []
    for (const e of entries ?? []) {
      const label = dayLabel(e.at)
      if (out.at(-1)?.label !== label) out.push({ label, items: [] })
      out.at(-1)!.items.push(e)
    }
    return out
  }, [entries])

  return (
    <Modal title="Admin log" onClose={onClose}>
      <p className="mb-4 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <Icon name="lock" size={14} className="mt-px shrink-0" />
        Only you can see this. Every change is kept here permanently and can’t be edited or removed. Names are chosen by
        each person, so the device tag shows which phone or browser made the change.
      </p>
      {error && <p className="text-sm text-neg">{error}</p>}
      {!entries && !error && <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}</div>}
      <div className="space-y-6">
        {days.map((d) => (
          <section key={d.label}>
            <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">{d.label}</h3>
            <ul className="space-y-2">
              {d.items.map((en) => {
                const meta = META[en.action]
                const { title, lines } = details(en)
                const others = en.device ? [...(namesByDevice.get(en.device) ?? [])].filter((n) => n !== en.actor) : []
                const canRestore = en.action === 'expense.delete' || en.action === 'settlement.delete'
                const done = canRestore && (restored.has(en.id) || isLive(en))
                return (
                  <li key={en.id} className="rounded-2xl bg-surface-2/50 p-3.5">
                    <div className="flex items-start gap-3">
                      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${meta.tint}`}><Icon name={meta.icon} size={18} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{meta.label}{title && <span className="font-normal text-muted"> · {title}</span>}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          by <b className="font-semibold text-white">{en.actor || 'Someone'}</b>
                          {' · '}{new Date(en.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                          {en.device && <> · <span className="rounded bg-surface-3 px-1 font-mono text-[10px]">device {en.device.slice(0, 5)}</span></>}
                        </p>
                        {others.length > 0 && (
                          <p className="mt-1 text-xs text-warn">This device has also acted as {others.join(', ')}</p>
                        )}
                      </div>
                    </div>
                    {lines.length > 0 && (
                      <dl className="mt-3 space-y-1 border-t border-line pt-3 text-xs">
                        {lines.map(([k, v]) => (
                          <div key={k} className="flex gap-3">
                            <dt className="w-20 shrink-0 text-muted">{k}</dt>
                            <dd className="min-w-0 flex-1 break-words">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {canRestore && (
                      <div className="mt-3 flex justify-end">
                        {done ? (
                          <span className="flex items-center gap-1 text-xs font-semibold text-pos"><Icon name="check" size={14} /> Restored</span>
                        ) : (
                          <Button variant="ghost" className="!px-3.5 !py-1.5" disabled={!!busy} onClick={() => restore(en)}>
                            {busy === en.id ? 'Restoring…' : 'Restore'}
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  )
}
