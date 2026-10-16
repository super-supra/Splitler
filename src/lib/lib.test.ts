import { describe, expect, it } from 'vitest'
import { netBalances, pairwiseDebts, simplifyDebts } from './balances'
import { toMinor } from './money'
import { allocate, computeSplit } from './splits'
import type { Expense } from './types'

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

describe('allocate', () => {
  it('always sums to total', () => {
    expect(sum(allocate(100, [1, 1, 1]))).toBe(100)
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(sum(allocate(1, [1, 1, 1]))).toBe(1)
  })
})

describe('computeSplit', () => {
  it('equal', () => {
    const r = computeSplit(1000, 'equal', { a: 1, b: 1, c: 1 })
    expect(r.ok && sum(Object.values(r.owed))).toBe(1000)
  })
  it('exact validates sum', () => {
    expect(computeSplit(1000, 'exact', { a: 400, b: 500 }).ok).toBe(false)
    expect(computeSplit(1000, 'exact', { a: 400, b: 600 }).ok).toBe(true)
  })
  it('percent validates 100', () => {
    expect(computeSplit(1000, 'percent', { a: 50, b: 40 }).ok).toBe(false)
    const r = computeSplit(1001, 'percent', { a: 33.33, b: 33.33, c: 33.34 })
    expect(r.ok && sum(Object.values(r.owed))).toBe(1001)
  })
  it('shares', () => {
    const r = computeSplit(900, 'shares', { a: 1, b: 2 })
    expect(r.ok && r.owed).toEqual({ a: 300, b: 600 })
  })
})

const exp = (over: Partial<Expense>): Expense => ({
  id: 'e', description: 'x', amount: 3000, payerId: 'a', date: '', category: '',
  splitType: 'equal', splitValues: { a: 1, b: 1, c: 1 }, ...over,
})

describe('balances', () => {
  it('nets sum to zero', () => {
    const net = netBalances(['a', 'b', 'c'], [exp({}), exp({ payerId: 'b', amount: 600 })], [])
    expect(sum(Object.values(net))).toBe(0)
    expect(net.a).toBe(3000 - 1000 - 200)
  })
  it('settlement clears debt', () => {
    const net = netBalances(['a', 'b'], [exp({ splitValues: { a: 1, b: 1 }, amount: 1000 })],
      [{ id: 's', fromId: 'b', toId: 'a', amount: 500, date: '' }])
    expect(net).toEqual({ a: 0, b: 0 })
  })
  it('simplify handles chains', () => {
    // a owes b 10, b owes c 10 -> a pays c 10
    const t = simplifyDebts({ a: -1000, b: 0, c: 1000 })
    expect(t).toEqual([{ from: 'a', to: 'c', amount: 1000 }])
  })
  it('pairwise nets opposing debts', () => {
    const t = pairwiseDebts(
      [exp({ splitValues: { a: 1, b: 1 }, amount: 1000 }),
       exp({ payerId: 'b', splitValues: { a: 1, b: 1 }, amount: 400 })], [])
    expect(t).toEqual([{ from: 'b', to: 'a', amount: 300 }])
  })
})

describe('toMinor', () => {
  it('parses', () => {
    expect(toMinor('12.5')).toBe(1250)
    expect(toMinor('abc')).toBeNull()
    expect(toMinor('1.234')).toBeNull()
  })
})
