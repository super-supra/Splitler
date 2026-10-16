import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import type { Expense, Group, Settlement } from '../lib/types'

const KEY = 'splitly-session-v1'

export const uid = () => Math.random().toString(36).slice(2, 10)

interface State {
  groups: Group[]
}

type Action =
  | { type: 'addGroup'; name: string; currency: string; members: string[] }
  | { type: 'deleteGroup'; id: string }
  | { type: 'addMember'; groupId: string; name: string }
  | { type: 'saveExpense'; groupId: string; expense: Expense }
  | { type: 'deleteExpense'; groupId: string; expenseId: string }
  | { type: 'addSettlement'; groupId: string; settlement: Settlement }
  | { type: 'deleteSettlement'; groupId: string; settlementId: string }
  | { type: 'clear' }
  | { type: 'import'; groups: Group[] }

const log = (g: Group, text: string): Group => ({
  ...g,
  activity: [{ id: uid(), at: Date.now(), text }, ...g.activity],
})

function reduce(state: State, a: Action): State {
  const upd = (id: string, fn: (g: Group) => Group): State => ({
    groups: state.groups.map((g) => (g.id === id ? fn(g) : g)),
  })
  const nameOf = (g: Group, id: string) => g.members.find((m) => m.id === id)?.name ?? '?'

  switch (a.type) {
    case 'addGroup': {
      const g: Group = {
        id: uid(), name: a.name, currency: a.currency,
        members: a.members.map((name) => ({ id: uid(), name })),
        expenses: [], settlements: [], activity: [],
      }
      return { groups: [log(g, `Group "${a.name}" created`), ...state.groups] }
    }
    case 'deleteGroup':
      return { groups: state.groups.filter((g) => g.id !== a.id) }
    case 'addMember':
      return upd(a.groupId, (g) =>
        log({ ...g, members: [...g.members, { id: uid(), name: a.name }] }, `${a.name} joined the group`))
    case 'saveExpense':
      return upd(a.groupId, (g) => {
        const exists = g.expenses.some((e) => e.id === a.expense.id)
        const expenses = exists
          ? g.expenses.map((e) => (e.id === a.expense.id ? a.expense : e))
          : [a.expense, ...g.expenses]
        const verb = exists ? 'updated' : 'added'
        return log({ ...g, expenses }, `${nameOf(g, a.expense.payerId)} ${verb} "${a.expense.description}"`)
      })
    case 'deleteExpense':
      return upd(a.groupId, (g) => {
        const e = g.expenses.find((x) => x.id === a.expenseId)
        return log({ ...g, expenses: g.expenses.filter((x) => x.id !== a.expenseId) },
          `Deleted "${e?.description ?? 'expense'}"`)
      })
    case 'addSettlement':
      return upd(a.groupId, (g) =>
        log({ ...g, settlements: [a.settlement, ...g.settlements] },
          `${nameOf(g, a.settlement.fromId)} paid ${nameOf(g, a.settlement.toId)}`))
    case 'deleteSettlement':
      return upd(a.groupId, (g) =>
        log({ ...g, settlements: g.settlements.filter((s) => s.id !== a.settlementId) }, 'Payment removed'))
    case 'clear':
      return { groups: [] }
    case 'import':
      return { groups: a.groups }
  }
}

function load(): State {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as State
  } catch { /* ignore */ }
  return { groups: [] }
}

const Ctx = createContext<{ state: State; dispatch: (a: Action) => void } | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduce, undefined, load)
  useEffect(() => {
    try { sessionStorage.setItem(KEY, JSON.stringify(state)) } catch { /* ignore */ }
  }, [state])
  const value = useMemo(() => ({ state, dispatch }), [state])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const c = useContext(Ctx)
  if (!c) throw new Error('StoreProvider missing')
  return c
}
