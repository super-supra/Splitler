import { useMemo, useState } from 'react'
import { netBalances, pairwiseDebts, simplifyDebts } from '../lib/balances'
import { formatMoney } from '../lib/money'
import type { Expense, Group, Transfer } from '../lib/types'
import { useGroupCtx } from '../context'
import { Breakdown, Collapse } from './Breakdown'
import { ExpenseForm } from './ExpenseForm'
import { ActivityTab, BalancesTab, ExpensesTab } from './GroupTabs'
import { Icon } from './icons'
import { SettleForm } from './SettleForm'
import { AvatarStack, Button, Segmented } from './ui'

type Tab = 'expenses' | 'balances' | 'activity'
const TABS: { id: Tab; label: string }[] = [
  { id: 'expenses', label: 'Expenses' },
  { id: 'balances', label: 'Balances' },
  { id: 'activity', label: 'Activity' },
]

export function GroupView({ group }: { group: Group }) {
  const { me } = useGroupCtx()
  const [tab, setTab] = useState<Tab>('expenses')
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)
  const [settle, setSettle] = useState<Transfer | 'new' | null>(null)
  const [simplify, setSimplify] = useState(true)
  const [open, setOpen] = useState(false)

  const net = useMemo(
    () => netBalances(group.members.map((m) => m.id), group.expenses, group.settlements),
    [group],
  )
  // single "who pays whom" plan shared by the header, Balances tab and Settle up sheet
  const transfers = useMemo(
    () => (simplify ? simplifyDebts(net) : pairwiseDebts(group.expenses, group.settlements)),
    [simplify, net, group],
  )
  const money = (n: number) => formatMoney(n, group.currency)
  const total = group.expenses.reduce((a, e) => a + e.amount, 0)
  const mine = me ? net[me] ?? 0 : null

  return (
    <div>
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">{group.name}</h1>
        <div className="mt-3 flex items-center gap-3">
          <AvatarStack people={group.members} />
          <span className="text-sm text-muted">{group.members.length} people · {money(total)} spent</span>
        </div>
        {mine === 0 && <p className="mt-5 font-semibold">You’re all settled up ✨</p>}
        {me && mine !== null && mine !== 0 && (
          <div className="mt-5">
            <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
              className="flex items-center gap-2 text-left text-[15px] text-muted">
              {mine > 0 ? 'You get back' : 'You have to pay'}
              <b className={`text-2xl font-extrabold tabular-nums ${mine > 0 ? 'text-pos' : 'text-neg'}`}>{money(Math.abs(mine))}</b>
              <span className="grid size-7 place-items-center rounded-full bg-surface-2 text-white">
                <Icon name="back" size={14} className={`transition-transform ${open ? 'rotate-90' : '-rotate-90'}`} />
              </span>
            </button>
            <Collapse open={open}>
              <div className="pt-3"><Breakdown group={group} personId={me} transfers={transfers} onSettle={setSettle} /></div>
            </Collapse>
          </div>
        )}
        <div className="mt-5 flex gap-2">
          <Button variant="ghost" className="flex flex-1 items-center justify-center gap-2 !py-3"
            onClick={() => setEditing('new')} disabled={group.members.length === 0}>
            <Icon name="plus" size={18} /> Add expense
          </Button>
          <Button className="flex flex-1 items-center justify-center gap-2" onClick={() => setSettle('new')} disabled={group.members.length < 2}>
            <Icon name="cash" size={18} /> Settle up
          </Button>
        </div>
      </header>

      <Segmented className="mb-5 mt-7" value={tab} options={TABS} onChange={setTab} />

      {tab === 'expenses' && <ExpensesTab group={group} onEdit={setEditing} onAdd={() => setEditing('new')} />}
      {tab === 'balances' && <BalancesTab group={group} net={net} transfers={transfers}
        simplify={simplify} onSimplify={setSimplify} onSettle={setSettle} />}
      {tab === 'activity' && <ActivityTab group={group} />}

      {editing && <ExpenseForm group={group} existing={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {settle && <SettleForm group={group} transfers={transfers} preset={settle === 'new' ? undefined : settle} onClose={() => setSettle(null)} />}
    </div>
  )
}
