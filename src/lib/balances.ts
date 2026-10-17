import { computeSplit } from './splits'
import type { Expense, Settlement, Transfer } from './types'

/** Net balance per person: positive = is owed money, negative = owes money. */
export function netBalances(
  memberIds: string[],
  expenses: Expense[],
  settlements: Settlement[],
): Record<string, number> {
  const net: Record<string, number> = Object.fromEntries(memberIds.map((id) => [id, 0]))
  for (const e of expenses) {
    const res = computeSplit(e.amount, e.splitType, e.splitValues)
    if (!res.ok) continue
    net[e.payerId] = (net[e.payerId] ?? 0) + e.amount
    for (const [id, owed] of Object.entries(res.owed)) net[id] = (net[id] ?? 0) - owed
  }
  for (const s of settlements) {
    net[s.fromId] = (net[s.fromId] ?? 0) + s.amount
    net[s.toId] = (net[s.toId] ?? 0) - s.amount
  }
  return net
}

/** Each person's share of the group's spending (what they consumed, regardless of who paid). */
export function shares(memberIds: string[], expenses: Expense[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(memberIds.map((id) => [id, 0]))
  for (const e of expenses) {
    const res = computeSplit(e.amount, e.splitType, e.splitValues)
    if (!res.ok) continue
    for (const [id, owed] of Object.entries(res.owed)) out[id] = (out[id] ?? 0) + owed
  }
  return out
}

/** Minimise the number of payments: repeatedly match largest creditor with largest debtor. */
export function simplifyDebts(net: Record<string, number>): Transfer[] {
  const creditors = Object.entries(net)
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, v }))
  const debtors = Object.entries(net)
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, v: -v }))
  const out: Transfer[] = []
  while (creditors.length && debtors.length) {
    creditors.sort((a, b) => b.v - a.v)
    debtors.sort((a, b) => b.v - a.v)
    const c = creditors[0]
    const d = debtors[0]
    const amt = Math.min(c.v, d.v)
    out.push({ from: d.id, to: c.id, amount: amt })
    c.v -= amt
    d.v -= amt
    if (c.v === 0) creditors.shift()
    if (d.v === 0) debtors.shift()
  }
  return out
}

/** Pairwise debts without simplification: who owes whom, netted per pair. */
export function pairwiseDebts(expenses: Expense[], settlements: Settlement[]): Transfer[] {
  const m = new Map<string, number>() // "a|b" with a<b: positive = a owes b
  const add = (debtor: string, creditor: string, amt: number) => {
    if (debtor === creditor || amt === 0) return
    const flip = debtor > creditor
    const key = flip ? `${creditor}|${debtor}` : `${debtor}|${creditor}`
    m.set(key, (m.get(key) ?? 0) + (flip ? -amt : amt))
  }
  for (const e of expenses) {
    const res = computeSplit(e.amount, e.splitType, e.splitValues)
    if (!res.ok) continue
    for (const [id, owed] of Object.entries(res.owed)) add(id, e.payerId, owed)
  }
  for (const s of settlements) add(s.toId, s.fromId, s.amount)
  const out: Transfer[] = []
  for (const [key, v] of m) {
    if (v === 0) continue
    const [a, b] = key.split('|')
    out.push(v > 0 ? { from: a, to: b, amount: v } : { from: b, to: a, amount: -v })
  }
  return out
}
