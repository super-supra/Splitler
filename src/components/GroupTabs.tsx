import { useMemo, useState } from 'react'
import { category } from '../lib/categories'
import { dayLabel, dayParts, monthLabel, relativeTime } from '../lib/format'
import { formatMoney } from '../lib/money'
import { computeSplit } from '../lib/splits'
import { copyText, toast } from '../lib/toast'
import type { Expense, Group, Settlement, Transfer } from '../lib/types'
import { useGroupCtx } from '../context'
import { Breakdown, Collapse } from './Breakdown'
import { Icon } from './icons'
import { Avatar, Button, inputCls, Toggle } from './ui'

const sectionCls = 'mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted'

type Item = { kind: 'expense'; date: string; e: Expense } | { kind: 'settle'; date: string; s: Settlement }

export function ExpensesTab({ group, onEdit, onAdd }: { group: Group; onEdit: (e: Expense) => void; onAdd: () => void }) {
  const { actions, me } = useGroupCtx()
  const name = (id: string) => (id === me ? 'You' : group.members.find((m) => m.id === id)?.name ?? '?')
  const money = (n: number) => formatMoney(n, group.currency)

  const months = useMemo(() => {
    const items: Item[] = [
      ...group.expenses.map((e) => ({ kind: 'expense' as const, date: e.date, e })),
      ...group.settlements.map((s) => ({ kind: 'settle' as const, date: s.date, s })),
    ].sort((a, b) => b.date.localeCompare(a.date))
    const out: { label: string; items: Item[] }[] = []
    for (const it of items) {
      const label = monthLabel(it.date)
      if (out.at(-1)?.label !== label) out.push({ label, items: [] })
      out.at(-1)!.items.push(it)
    }
    return out
  }, [group])

  if (months.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-3xl bg-surface px-6 py-12 text-center">
        <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-accent/15 text-accent"><Icon name="receipt" size={26} /></div>
        <h2 className="font-bold">No expenses yet</h2>
        <p className="mt-1 text-sm text-muted">Add the first one and Splitler will work out who has to pay whom.</p>
        <Button className="mt-5" onClick={onAdd}>Add expense</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {months.map((m) => (
        <section key={m.label}>
          <h3 className={sectionCls}>{m.label}</h3>
          <ul className="overflow-hidden rounded-2xl bg-surface">
            {m.items.map((it) => {
              const { mon, day } = dayParts(it.date)
              const dateCol = (
                <div className="w-8 shrink-0 text-center leading-tight text-muted">
                  <div className="text-[11px] uppercase">{mon}</div>
                  <div className="text-base font-semibold text-white/80">{day}</div>
                </div>
              )
              if (it.kind === 'settle') {
                const s = it.s
                return (
                  <li key={s.id} className="border-b border-line last:border-0">
                    <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[.03]"
                      onClick={() => {
                        if (confirm(`Remove payment of ${money(s.amount)}?`)) {
                          actions.deleteSettlement(s.id).then(() => toast('Payment removed')).catch((err) => alert(err.message))
                        }
                      }}>
                      {dateCol}
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-pos/15 text-pos"><Icon name="cash" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-muted">
                          <b className="font-semibold text-white">{name(s.fromId)}</b> paid <b className="font-semibold text-white">{name(s.toId)}</b>
                        </p>
                        {s.note && <p className="truncate text-xs text-muted">{s.note}</p>}
                      </div>
                      <span className="font-semibold tabular-nums text-pos">{money(s.amount)}</span>
                    </button>
                  </li>
                )
              }
              const e = it.e
              const cat = category(e.category)
              const res = computeSplit(e.amount, e.splitType, e.splitValues)
              const myShare = res.ok && me ? res.owed[me] ?? 0 : 0
              const lent = me && e.payerId === me ? e.amount - myShare : 0
              const borrowed = me && e.payerId !== me ? myShare : 0
              return (
                <li key={e.id} className="border-b border-line last:border-0">
                  <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[.03]"
                    onClick={() => onEdit(e)} aria-label={`Edit ${e.description}`}>
                    {dateCol}
                    <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${cat.tint}`}><Icon name={cat.icon} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{e.description}</p>
                      <p className="truncate text-xs text-muted">{name(e.payerId)} paid {money(e.amount)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      {!me ? (
                        <span className="font-semibold tabular-nums">{money(e.amount)}</span>
                      ) : lent > 0 ? (
                        <><div className="text-[11px] text-pos">you get back</div><div className="font-semibold tabular-nums text-pos">{money(lent)}</div></>
                      ) : borrowed > 0 ? (
                        <><div className="text-[11px] text-neg">your share</div><div className="font-semibold tabular-nums text-neg">{money(borrowed)}</div></>
                      ) : (
                        <div className="text-xs text-muted">not involved</div>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

export function BalancesTab({ group, net, transfers, spending, total, simplify, onSimplify, onSettle }: {
  group: Group
  /** total spent in the group, for the "big reveal" teaser */
  total: number
  net: Record<string, number>
  transfers: Transfer[]
  /** set once everyone is settled: each person's share of the total, shown instead of balances */
  spending: { shares: Record<string, number>; total: number } | null
  simplify: boolean
  onSimplify: (v: boolean) => void
  onSettle: (t: Transfer) => void
}) {
  const { actions, me } = useGroupCtx()
  const [newMember, setNewMember] = useState('')
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<Set<string>>(() => new Set(me ? [me] : []))
  const name = (id: string) => group.members.find((m) => m.id === id)?.name ?? '?'
  const money = (n: number) => formatMoney(n, group.currency)
  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Members · {group.members.length}</h3>
          <button className="text-sm font-semibold text-accent" onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : 'Add'}</button>
        </div>
        <ul className="overflow-hidden rounded-2xl bg-surface">
          {adding && (
            <li className="border-b border-line p-3">
              <form className="flex gap-2" onSubmit={(e) => {
                e.preventDefault()
                if (!newMember.trim()) return
                actions.addMember(newMember.trim())
                  .then(() => { toast(`${newMember.trim()} added`); setNewMember(''); setAdding(false) })
                  .catch((err) => alert(err.message))
              }}>
                <input className={inputCls} placeholder="Name" aria-label="New member name" autoFocus
                  value={newMember} onChange={(e) => setNewMember(e.target.value)} />
                <Button type="submit" disabled={!newMember.trim()}>Add</Button>
              </form>
            </li>
          )}
          {spending && (
            <li className="border-b border-line px-4 py-4">
              <p className="text-xs font-medium text-muted">Total spent</p>
              <p className="text-3xl font-extrabold tabular-nums">{money(spending.total)}</p>
              <p className="mt-1 text-sm text-pos">Everyone is settled up 🎉</p>
            </li>
          )}
          {spending && [...group.members].sort((a, b) => (spending.shares[b.id] ?? 0) - (spending.shares[a.id] ?? 0)).map((m) => {
            const share = spending.shares[m.id] ?? 0
            const top = Math.max(1, ...Object.values(spending.shares))
            const pct = spending.total ? Math.round((share / spending.total) * 100) : 0
            return (
              <li key={m.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                <Avatar id={m.id} name={m.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-semibold">{m.name}{m.id === me && <span className="ml-1.5 text-xs font-medium text-muted">(you)</span>}</p>
                    <p className="shrink-0 text-sm font-semibold tabular-nums">{money(share)} <span className="text-xs font-normal text-muted">{pct}%</span></p>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(share / top) * 100}%` }} />
                  </div>
                </div>
              </li>
            )
          })}
          {!spending && group.members.map((m) => {
            const v = net[m.id] ?? 0
            const isOpen = v !== 0 && open.has(m.id)
            const summary = (
              <>
                <Avatar id={m.id} name={m.name} />
                <div className="flex-1">
                  <p className="font-semibold">{m.name}{m.id === me && <span className="ml-1.5 text-xs font-medium text-muted">(you)</span>}</p>
                  <p className={`text-sm ${v > 0 ? 'text-pos' : v < 0 ? 'text-neg' : 'text-muted'}`}>
                    {v > 0 ? `Gets back ${money(v)}` : v < 0 ? `Has to pay ${money(-v)}` : 'All settled'}
                  </p>
                </div>
              </>
            )
            return (
              <li key={m.id} className="border-b border-line last:border-0">
                {v === 0 ? (
                  <div className="flex items-center gap-3 px-4 py-3">{summary}</div>
                ) : (
                  <>
                    <button type="button" aria-expanded={isOpen} onClick={() => toggle(m.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[.03]">
                      {summary}
                      <Icon name="back" size={16} className={`text-muted transition-transform ${isOpen ? 'rotate-90' : '-rotate-90'}`} />
                    </button>
                    <Collapse open={isOpen}>
                      <div className="px-4 pb-3"><Breakdown group={group} personId={m.id} transfers={transfers} onSettle={onSettle} /></div>
                    </Collapse>
                  </>
                )}
              </li>
            )
          })}
        </ul>
        {spending ? (
          <Button variant="ghost" className="mt-3 flex w-full items-center justify-center gap-2" onClick={async () => {
            const lines = [...group.members].sort((a, b) => (spending.shares[b.id] ?? 0) - (spending.shares[a.id] ?? 0))
              .map((m) => `${m.name} ${money(spending.shares[m.id] ?? 0)}`)
            await copyText(`${group.name} — ${money(spending.total)} total\n${lines.join('\n')}`, 'Summary copied')
          }}><Icon name="copy" size={16} /> Copy summary</Button>
        ) : transfers.length === 0 ? (
          <p className="mt-3 text-center text-sm text-muted">🎉 Everyone is settled up</p>
        ) : (
          <Button variant="ghost" className="mt-3 flex w-full items-center justify-center gap-2" onClick={async () => {
            const text = transfers.map((t) => `${name(t.from)} pays ${name(t.to)} ${money(t.amount)}`).join('\n')
            await copyText(`${group.name}\n${text}`, 'Summary copied')
          }}><Icon name="copy" size={16} /> Copy summary</Button>
        )}
      </section>

      {!spending && transfers.length > 0 && group.expenses.length > 0 && (
        <div className="flex gap-3 rounded-2xl bg-accent/10 px-4 py-3 ring-1 ring-accent/20">
          <span className="text-xl leading-6" aria-hidden>🤝</span>
          <div>
            <p className="font-semibold">
              {transfers.length} payment{transfers.length === 1 ? '' : 's'} left until the big reveal
            </p>
            <p className="mt-0.5 text-sm text-muted">When everyone’s settled, see who spent what from the {money(total)} total.</p>
          </div>
        </div>
      )}

      {!spending && <div className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3.5">
        <span className="grid size-10 place-items-center rounded-xl bg-warn/15 text-warn"><Icon name="bolt" /></span>
        <div className="flex-1">
          <p className="font-semibold">Simplify debts</p>
          <p className="text-xs text-muted">Combine debts to reduce the number of payments</p>
        </div>
        <Toggle checked={simplify} onChange={onSimplify} label="Simplify debts" />
      </div>}
    </div>
  )
}

export function ActivityTab({ group }: { group: Group }) {
  const days = useMemo(() => {
    const out: { label: string; items: Group['activity'] }[] = []
    for (const a of group.activity) {
      const label = dayLabel(a.at)
      if (out.at(-1)?.label !== label) out.push({ label, items: [] })
      out.at(-1)!.items.push(a)
    }
    return out
  }, [group])

  if (days.length === 0) return <p className="py-10 text-center text-sm text-muted">Nothing has happened yet.</p>

  return (
    <div className="space-y-6">
      {days.map((d) => (
        <section key={d.label}>
          <h3 className={sectionCls}>{d.label}</h3>
          <ol className="rounded-2xl bg-surface px-4 py-2">
            {d.items.map((a) => (
              <li key={a.id} className="relative flex gap-3 py-2.5 pl-5 before:absolute before:bottom-0 before:left-[5px] before:top-0 before:w-px before:bg-line first:before:top-1/2 last:before:bottom-1/2">
                <span className="absolute left-0 top-1/2 size-[11px] -translate-y-1/2 rounded-full border-2 border-accent bg-surface" />
                <p className="flex-1 text-sm">{a.text}</p>
                <time className="shrink-0 text-xs text-muted" dateTime={new Date(a.at).toISOString()}>{relativeTime(a.at)}</time>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
