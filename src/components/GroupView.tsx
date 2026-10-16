import { useMemo, useState } from 'react'
import { netBalances, pairwiseDebts, simplifyDebts } from '../lib/balances'
import { formatMoney } from '../lib/money'
import type { Expense, Group, Transfer } from '../lib/types'
import { useStore } from '../store/store'
import { ExpenseForm } from './ExpenseForm'
import { SettleForm } from './SettleForm'
import { Button, Card, inputCls } from './ui'

type Tab = 'expenses' | 'balances' | 'activity'

export function GroupView({ group, onBack }: { group: Group; onBack: () => void }) {
  const { dispatch } = useStore()
  const [tab, setTab] = useState<Tab>('expenses')
  const [simplify, setSimplify] = useState(true)
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)
  const [settle, setSettle] = useState<Transfer | 'new' | null>(null)
  const [newMember, setNewMember] = useState('')

  const name = (id: string) => group.members.find((m) => m.id === id)?.name ?? '?'
  const money = (n: number) => formatMoney(n, group.currency)

  const net = useMemo(
    () => netBalances(group.members.map((m) => m.id), group.expenses, group.settlements),
    [group],
  )
  const transfers = useMemo(
    () => (simplify ? simplifyDebts(net) : pairwiseDebts(group.expenses, group.settlements)),
    [simplify, net, group],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-emerald-600">← All groups</button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setSettle('new')}>Settle up</Button>
          <Button onClick={() => setEditing('new')} disabled={group.members.length === 0}>Add expense</Button>
        </div>
      </div>
      <div>
        <h1 className="text-2xl font-bold">{group.name}</h1>
        <p className="text-sm text-slate-500">
          {group.members.map((m) => m.name).join(', ')} · {group.currency}
        </p>
      </div>

      <div className="flex gap-1 rounded-lg bg-slate-200 p-1 dark:bg-slate-800" role="tablist">
        {(['expenses', 'balances', 'activity'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`flex-1 rounded-md py-1.5 text-sm capitalize ${tab === t ? 'bg-white shadow dark:bg-slate-700' : ''}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'expenses' && (
        <div className="space-y-2">
          {group.expenses.length === 0 && group.settlements.length === 0 && (
            <p className="py-8 text-center text-slate-500">No expenses yet. Add your first one.</p>
          )}
          {group.expenses.map((e) => (
            <Card key={e.id} className="flex items-center justify-between">
              <div>
                <p className="font-medium">{e.description}</p>
                <p className="text-xs text-slate-500">
                  {name(e.payerId)} paid · {e.date} · {e.category} · {e.splitType}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{money(e.amount)}</span>
                <Button variant="ghost" onClick={() => setEditing(e)} aria-label={`Edit ${e.description}`}>Edit</Button>
                <Button variant="danger" aria-label={`Delete ${e.description}`}
                  onClick={() => dispatch({ type: 'deleteExpense', groupId: group.id, expenseId: e.id })}>Delete</Button>
              </div>
            </Card>
          ))}
          {group.settlements.map((s) => (
            <Card key={s.id} className="flex items-center justify-between">
              <p className="text-sm">💸 {name(s.fromId)} paid {name(s.toId)} · {s.date}</p>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-emerald-600">{money(s.amount)}</span>
                <Button variant="danger"
                  onClick={() => dispatch({ type: 'deleteSettlement', groupId: group.id, settlementId: s.id })}>Remove</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'balances' && (
        <div className="space-y-4">
          <Card>
            <h2 className="mb-2 font-semibold">Net balances</h2>
            <ul className="space-y-1">
              {group.members.map((m) => (
                <li key={m.id} className="flex justify-between text-sm">
                  <span>{m.name}</span>
                  <span className={net[m.id] > 0 ? 'text-emerald-600' : net[m.id] < 0 ? 'text-red-600' : 'text-slate-500'}>
                    {net[m.id] > 0 ? 'gets back ' : net[m.id] < 0 ? 'owes ' : 'settled '}
                    {net[m.id] !== 0 && money(Math.abs(net[m.id]))}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">Who pays whom</h2>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={simplify} onChange={(e) => setSimplify(e.target.checked)} />
                Simplify debts
              </label>
            </div>
            {transfers.length === 0 ? (
              <p className="text-sm text-slate-500">All settled up 🎉</p>
            ) : (
              <ul className="space-y-2">
                {transfers.map((t, i) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span>{name(t.from)} → {name(t.to)}</span>
                    <span className="flex items-center gap-2">
                      <b>{money(t.amount)}</b>
                      <Button variant="ghost" onClick={() => setSettle(t)}>Settle</Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {transfers.length > 0 && (
              <Button variant="ghost" className="mt-3" onClick={() => {
                const text = transfers.map((t) => `${name(t.from)} pays ${name(t.to)} ${money(t.amount)}`).join('\n')
                navigator.clipboard?.writeText(text)
              }}>Copy summary</Button>
            )}
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold">Add a member</h2>
            <form className="flex gap-2" onSubmit={(e) => {
              e.preventDefault()
              if (!newMember.trim()) return
              dispatch({ type: 'addMember', groupId: group.id, name: newMember.trim() })
              setNewMember('')
            }}>
              <input className={inputCls} placeholder="Name" value={newMember} onChange={(e) => setNewMember(e.target.value)} />
              <Button type="submit">Add</Button>
            </form>
          </Card>
        </div>
      )}

      {tab === 'activity' && (
        <ul className="space-y-2">
          {group.activity.map((a) => (
            <li key={a.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
              {a.text}
              <span className="ml-2 text-xs text-slate-500">{new Date(a.at).toLocaleTimeString()}</span>
            </li>
          ))}
        </ul>
      )}

      {editing && <ExpenseForm group={group} existing={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {settle && <SettleForm group={group} preset={settle === 'new' ? undefined : settle} onClose={() => setSettle(null)} />}
    </div>
  )
}
