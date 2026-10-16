import { useMemo, useState } from 'react'
import { netBalances } from '../lib/balances'
import { formatMoney } from '../lib/money'
import type { Expense, Group, Transfer } from '../lib/types'
import { useGroupCtx } from '../context'
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

  const net = useMemo(
    () => netBalances(group.members.map((m) => m.id), group.expenses, group.settlements),
    [group],
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
        {mine !== null && (
          <p className="mt-5 text-[15px] text-muted">
            {mine > 0 ? <>You get back <b className="text-2xl font-extrabold tabular-nums text-pos">{money(mine)}</b></>
              : mine < 0 ? <>You have to pay <b className="text-2xl font-extrabold tabular-nums text-neg">{money(-mine)}</b></>
              : <span className="font-semibold text-white">You’re all settled up ✨</span>}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <Button className="flex items-center gap-2" onClick={() => setSettle('new')} disabled={group.members.length < 2}>
            <Icon name="cash" size={18} /> Settle up
          </Button>
          <Button variant="ghost" className="flex items-center gap-2" onClick={() => setTab('balances')}>
            <Icon name="users" size={18} /> Balances
          </Button>
        </div>
      </header>

      <Segmented className="mb-5 mt-7" value={tab} options={TABS} onChange={setTab} />

      {tab === 'expenses' && <ExpensesTab group={group} onEdit={setEditing} onAdd={() => setEditing('new')} />}
      {tab === 'balances' && <BalancesTab group={group} net={net} onSettle={setSettle} />}
      {tab === 'activity' && <ActivityTab group={group} />}

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-xl justify-end px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <Button className="pointer-events-auto flex items-center gap-2 shadow-xl shadow-accent/30 !py-3.5"
          onClick={() => setEditing('new')} disabled={group.members.length === 0}>
          <Icon name="plus" size={20} /> Add expense
        </Button>
      </div>

      {editing && <ExpenseForm group={group} existing={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {settle && <SettleForm group={group} preset={settle === 'new' ? undefined : settle} onClose={() => setSettle(null)} />}
    </div>
  )
}
