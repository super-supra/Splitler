import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const COOKIE = 'splitler_admin'
const SESSION_MS = 1000 * 60 * 60 * 24 * 14

const sha = (s: string) => createHash('sha256').update(s).digest()

export function passwordMatches(input: string, expected: string): boolean {
  return timingSafeEqual(sha(input), sha(expected))
}

const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest('hex')

export function makeToken(secret: string, now = Date.now()): string {
  const exp = String(now + SESSION_MS)
  return `${exp}.${sign(exp, secret)}`
}

export function tokenValid(token: string | undefined, secret: string, now = Date.now()): boolean {
  if (!token) return false
  const [exp, sig] = token.split('.')
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false
  const want = Buffer.from(sign(exp, secret))
  const got = Buffer.from(sig)
  return want.length === got.length && timingSafeEqual(want, got)
}

export const sessionSeconds = SESSION_MS / 1000
