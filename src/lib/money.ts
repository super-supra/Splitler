/** Parse a user-entered decimal string into integer minor units. Returns null if invalid. */
export function toMinor(input: string): number | null {
  const s = input.trim().replace(/,/g, '')
  if (!/^\d*\.?\d{0,2}$/.test(s) || s === '' || s === '.') return null
  return Math.round(parseFloat(s) * 100)
}

export function fromMinor(minor: number): string {
  return (minor / 100).toFixed(2)
}

export function formatMoney(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minor / 100)
  } catch {
    return `${currency} ${fromMinor(minor)}`
  }
}
