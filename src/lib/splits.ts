import type { SplitType } from './types'

/**
 * Distribute `total` minor units across `weights` using the largest-remainder
 * method so the parts always sum exactly to `total`.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (weights.length === 0 || sum <= 0) return weights.map(() => 0)
  const raw = weights.map((w) => (total * w) / sum)
  const base = raw.map(Math.floor)
  let left = total - base.reduce((a, b) => a + b, 0)
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of order) {
    if (left <= 0) break
    base[i] += 1
    left -= 1
  }
  return base
}

export type SplitResult =
  | { ok: true; owed: Record<string, number> }
  | { ok: false; error: string }

/** Compute how much each person owes (minor units) for an expense. */
export function computeSplit(
  total: number,
  type: SplitType,
  values: Record<string, number>,
): SplitResult {
  const ids = Object.keys(values)
  if (ids.length === 0) return { ok: false, error: 'Select at least one person to split with.' }

  if (type === 'exact') {
    const sum = ids.reduce((a, id) => a + values[id], 0)
    if (sum !== total) return { ok: false, error: 'Exact amounts must add up to the total.' }
    return { ok: true, owed: { ...values } }
  }

  if (type === 'percent') {
    const sum = ids.reduce((a, id) => a + values[id], 0)
    if (Math.abs(sum - 100) > 0.001) return { ok: false, error: 'Percentages must add up to 100%.' }
  }

  // equal -> weights are all 1; percent/shares -> the entered weights
  const weights = ids.map((id) => (type === 'equal' ? 1 : values[id]))
  if (weights.some((w) => w < 0) || weights.every((w) => w === 0)) {
    return { ok: false, error: 'Enter a valid split.' }
  }
  const parts = allocate(total, weights)
  const owed: Record<string, number> = {}
  ids.forEach((id, i) => (owed[id] = parts[i]))
  return { ok: true, owed }
}
