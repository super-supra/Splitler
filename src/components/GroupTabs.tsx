import { useMemo, useState } from 'react'
import { pairwiseDebts, simplifyDebts } from '../lib/balances'
import { category } from '../lib/categories'
import { dayLabel, dayParts, monthLabel, relativeTime } from '../lib/format'
import { formatMoney } from '../lib/money'
import { computeSplit } from '../lib/splits'
import { copyText, toast } from '../lib/toast'
import type { Expense, Group, Settlement, Transfer } from '../lib/types'
import { useGroupCtx } from '../context'
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
        <p className="mt-1 text-sm text-muted">Add the first one and Splitler will work out who owes whom.</p>
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
                      <p className="flex-1 text-sm text-muted">
                        <b className="font-semibold text-white">{name(s.fromId)}</b> paid <b className="font-semibold text-white">{name(s.toId)}</b>
                      </p>
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
                        <><div className="text-[11px] text-pos">you lent</div><div className="font-semibold tabular-nums text-pos">{money(lent)}</div></>
                      ) : borrowed > 0 ? (
                        <><div className="text-[11px] text-neg">you borrowed</div><div className="font-semibold tabular-nums text-neg">{money(borrowed)}</div></>
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

export function BalancesTab({ group, net, onSettle }: {
  group: Group; net: Record<string, number>; onSettle: (t: Transfer) => void
}) {
  const { actions, me } = useGroupCtx()
  const [simplify, setSimplify] = useState(true)
  const [newMember, setNewMember] = useState('')
  const [adding, setAdding] = useState(false)
  const name = (id: string) => group.members.find((m) => m.id === id)?.name ?? '?'
  const money = (n: number) => formatMoney(n, group.currency)
  const transfers = useMemo(
    () => (simplify ? simplifyDebts(net) : pairwiseDebts(group.expenses, group.settlements)),
    [simplify, net, group],
  )

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
          {group.members.map((m) => {
            const v = net[m.id] ?? 0
            return (
              <li key={m.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                <Avatar id={m.id} name={m.name} />
                <div className="flex-1">
                  <p className="font-semibold">{m.name}{m.id === me && <span className="ml-1.5 text-xs font-medium text-muted">(you)</span>}</p>
                  <p className={`text-sm ${v > 0 ? 'text-pos' : v < 0 ? 'text-neg' : 'text-muted'}`}>
                    {v > 0 ? `Is owed ${money(v)}` : v < 0 ? `Owes ${money(-v)}` : 'Settled up'}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <div className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3.5">
        <span className="grid size-10 place-items-center rounded-xl bg-warn/15 text-warn"><Icon name="bolt" /></span>
        <div className="flex-1">
          <p className="font-semibold">Simplify debts</p>
          <p className="text-xs text-muted">Combine debts to reduce the number of payments</p>
        </div>
        <Toggle checked={simplify} onChange={setSimplify} label="Simplify debts" />
      </div>

      <section>
        <h3 className={sectionCls}>Suggested payments</h3>
        {transfers.length === 0 ? (
          <div className="rounded-2xl bg-surface px-4 py-8 text-center">
            <p className="text-2xl">🎉</p>
            <p className="mt-1 font-semibold">All settled up</p>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-2xl bg-surface">
            {transfers.map((t, i) => (
              <li key={i} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                <div className="flex items-center gap-1.5">
                  <Avatar id={t.from} name={name(t.from)} size="sm" />
                  <Icon name="arrow" size={14} className="text-muted" />
                  <Avatar id={t.to} name={name(t.to)} size="sm" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm"><b>{name(t.from)}</b> <span className="text-muted">pays</span> <b>{name(t.to)}</b></p>
                  <p className="font-semibold tabular-nums">{money(t.amount)}</p>
                </div>
                <Button variant="ghost" className="!px-3.5 !py-2" onClick={() => onSettle(t)}>Settle</Button>
              </li>
            ))}
          </ul>
        )}
        {transfers.length > 0 && (
          <Button variant="ghost" className="mt-3 flex w-full items-center justify-center gap-2" onClick={async () => {
            const text = transfers.map((t) => `${name(t.from)} pays ${name(t.to)} ${money(t.amount)}`).join('\n')
            await copyText(`${group.name}\n${text}`, 'Summary copied')
          }}><Icon name="copy" size={16} /> Copy summary</Button>
        )}
      </section>
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
