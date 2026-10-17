import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { computeSplit } from '../src/lib/splits.js'
import { COOKIE, makeToken, passwordMatches, sessionSeconds, tokenValid } from './auth.js'
import type { Store } from './store.js'

const MAX_MEMBERS = 30
const MAX_EXPENSES = 500
const MAX_SETTLEMENTS = 500
const MAX_ACTIVITY = 200

export interface Req {
  method: string
  path: string
  query: Record<string, string>
  body: unknown
  cookies: Record<string, string>
  ip: string
  secure: boolean
}
export interface Res {
  status: number
  body?: unknown
  headers?: Record<string, string>
}

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
const fail = (status: number, message: string): never => { throw new HttpError(status, message) }

const newId = (bytes = 6) => randomBytes(bytes).toString('base64url')
const GROUP_ID = /^[A-Za-z0-9_-]{22}$/

const keys = (id: string) => ({
  meta: `g:${id}:meta`,
  members: `g:${id}:members`,
  expenses: `g:${id}:expenses`,
  settlements: `g:${id}:settlements`,
  activity: `g:${id}:activity`,
  audit: `g:${id}:audit`,
})
const ADMIN_INDEX = 'admin:groups'

// ---------- input schemas ----------
const name = (max: number) => z.string().trim().min(1).max(max)
const actor = z.string().trim().max(40).optional()
/** random per-browser id, so the admin log can tell devices apart even when names are self-chosen */
const device = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).optional()
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const createGroupIn = z.object({
  name: name(60),
  currency: z.string().regex(/^[A-Z]{3}$/),
  members: z.array(name(40)).min(2).max(MAX_MEMBERS),
})
const memberIn = z.object({ name: name(40), actor, device })
const expenseIn = z.object({
  description: name(100),
  amount: z.number().int().min(1).max(10_000_000_000),
  payerId: z.string().max(40),
  date: isoDate,
  category: z.string().trim().max(30),
  splitType: z.enum(['equal', 'exact', 'percent', 'shares']),
  splitValues: z.record(z.string().max(40), z.number().min(0).max(10_000_000_000)),
  actor,
  device,
})
const settlementIn = z.object({
  fromId: z.string().max(40),
  toId: z.string().max(40),
  amount: z.number().int().min(1).max(10_000_000_000),
  date: isoDate,
  note: z.string().trim().max(120).optional(),
  actor,
  device,
})
const whoIn = z.object({ actor, device })
const loginIn = z.object({ password: z.string().max(200) })

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body)
  if (!r.success) fail(400, 'Invalid request: ' + (r.error.issues[0]?.path.join('.') || 'body'))
  return (r as { data: T }).data
}

// ---------- group persistence ----------
interface Meta { name: string; currency: string; createdAt: number }
interface Member { id: string; name: string; createdAt: number }

async function loadMeta(s: Store, id: string): Promise<Meta> {
  if (!GROUP_ID.test(id)) return fail(404, 'Group not found')
  const raw = await s.hget(keys(id).meta, 'data')
  if (!raw) return fail(404, 'Group not found')
  return JSON.parse(raw) as Meta
}

const parseAll = <T>(h: Record<string, string>) => Object.values(h).map((v) => JSON.parse(v) as T)

async function loadGroup(s: Store, id: string) {
  const k = keys(id)
  const [meta, ver, members, expenses, settlements, activity] = await Promise.all([
    loadMeta(s, id),
    s.hget(k.meta, 'ver'),
    s.hgetall(k.members),
    s.hgetall(k.expenses),
    s.hgetall(k.settlements),
    s.hgetall(k.activity),
  ])
  const byNew = (a: { createdAt?: number }, b: { createdAt?: number }) => (b.createdAt ?? 0) - (a.createdAt ?? 0)
  return {
    ver: ver ?? '0',
    group: {
      id,
      name: meta.name,
      currency: meta.currency,
      members: parseAll<Member>(members).sort((a, b) => a.createdAt - b.createdAt),
      expenses: parseAll<{ createdAt?: number }>(expenses).sort(byNew),
      settlements: parseAll<{ createdAt?: number }>(settlements).sort(byNew),
      activity: parseAll<{ at: number }>(activity).sort((a, b) => b.at - a.at),
    },
  }
}

/** Mark the group as changed. Groups are kept until the admin deletes them. */
async function touch(s: Store, id: string) {
  const k = keys(id)
  await s.hset(k.meta, 'ver', `${Date.now()}-${newId(3)}`)
  await keepForever(s, id)
}

/** Clear the 7-day expiry that groups created before it was removed still carry. */
async function keepForever(s: Store, id: string) {
  await Promise.all(Object.values(keys(id)).map((key) => s.persist(key)))
}

async function log(s: Store, id: string, by: string | undefined, text: string) {
  const k = keys(id).activity
  const at = Date.now()
  await s.hset(k, newId(), JSON.stringify({ id: newId(), at, text: `${by?.trim() || 'Someone'} ${text}` }))
  if ((await s.hlen(k)) > MAX_ACTIVITY) {
    const all = Object.entries(await s.hgetall(k))
      .map(([field, v]) => ({ field, at: (JSON.parse(v) as { at: number }).at }))
      .sort((a, b) => a.at - b.at)
    for (const { field } of all.slice(0, 50)) await s.hdel(k, field)
  }
}

export type AuditAction =
  | 'group.create' | 'member.add'
  | 'expense.add' | 'expense.update' | 'expense.delete' | 'expense.restore'
  | 'settlement.add' | 'settlement.delete' | 'settlement.restore'

/**
 * Admin-only, append-only record of every change. Entries are never edited or trimmed;
 * deletes keep a full snapshot in `before` so the admin can see (and restore) what was removed.
 */
export interface AuditEntry {
  id: string
  at: number
  /** write order; breaks ties when several entries share a millisecond */
  seq: number
  action: AuditAction
  actor?: string
  device?: string
  before?: unknown
  after?: unknown
  /** for restores: the delete entry this undoes */
  ref?: string
}

async function audit(s: Store, id: string, e: Omit<AuditEntry, 'id' | 'at' | 'seq'>) {
  const entry: AuditEntry = { id: newId(), at: Date.now(), seq: await s.hlen(keys(id).audit), ...e }
  await s.hset(keys(id).audit, entry.id, JSON.stringify(entry))
}

/** Allow a day of slack so a user ahead of UTC can still pick their own "today". */
function notFuture(date: string) {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  if (date > tomorrow) fail(400, 'Date can’t be in the future')
}

async function respondGroup(s: Store, id: string, status = 200): Promise<Res> {
  return { status, body: await loadGroup(s, id) }
}

function memberIds(members: Member[]) { return new Set(members.map((m) => m.id)) }

function validateExpense(input: z.infer<typeof expenseIn>, members: Member[]) {
  const ids = memberIds(members)
  if (!ids.has(input.payerId)) fail(400, 'Payer is not in this group')
  if (!Object.keys(input.splitValues).every((id) => ids.has(id))) fail(400, 'Split includes someone outside this group')
  const res = computeSplit(input.amount, input.splitType, input.splitValues)
  if (!res.ok) fail(400, res.error)
}

// ---------- rate limiting ----------
async function limit(s: Store, bucket: string, ip: string, max: number, windowSeconds: number) {
  const n = await s.incr(`rl:${bucket}:${ip}`, windowSeconds)
  if (n > max) fail(429, 'Too many requests, please slow down')
}

// ---------- router ----------
export async function handle(req: Req, s: Store, env: Record<string, string | undefined> = process.env): Promise<Res> {
  try {
    return await route(req, s, env)
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { error: e.message } }
    console.error(e)
    return { status: 500, body: { error: 'Something went wrong' } }
  }
}

async function route(req: Req, s: Store, env: Record<string, string | undefined>): Promise<Res> {
  const parts = req.path.replace(/^\/api\/?/, '').split('/').filter(Boolean)
  const secret = env.SESSION_SECRET
  const isAdmin = () => !!secret && tokenValid(req.cookies[COOKIE], secret)
  const requireAdmin = () => { if (!isAdmin()) fail(401, 'Admin login required') }
  const write = () => limit(s, 'w', req.ip, 60, 60)
  const m = req.method

  // --- admin ---
  if (parts[0] === 'admin') {
    if (parts[1] === 'me' && m === 'GET') return { status: 200, body: { admin: isAdmin() } }

    if (parts[1] === 'login' && m === 'POST') {
      await limit(s, 'login', req.ip, 10, 15 * 60)
      const expected = env.ADMIN_PASSWORD
      if (!expected || !secret) fail(500, 'Server is not configured')
      const { password } = parse(loginIn, req.body)
      if (!passwordMatches(password, expected!)) fail(401, 'Wrong password')
      const cookie = [`${COOKIE}=${makeToken(secret!)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${sessionSeconds}`]
      if (req.secure) cookie.push('Secure')
      return { status: 200, body: { admin: true }, headers: { 'Set-Cookie': cookie.join('; ') } }
    }

    if (parts[1] === 'logout' && m === 'POST') {
      return { status: 200, body: { admin: false }, headers: { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` } }
    }

    if (parts[1] === 'groups' && m === 'GET') {
      requireAdmin()
      const index = await s.hgetall(ADMIN_INDEX)
      const out: { id: string; name: string; createdAt: number }[] = []
      for (const [id, raw] of Object.entries(index)) {
        const ttl = await s.ttl(keys(id).meta)
        if (ttl === -2) { await s.hdel(ADMIN_INDEX, id); continue } // gone (deleted or expired before this change)
        if (ttl > 0) await keepForever(s, id)
        const info = JSON.parse(raw) as { name: string; createdAt: number }
        out.push({ id, name: info.name, createdAt: info.createdAt })
      }
      return { status: 200, body: { groups: out.sort((a, b) => b.createdAt - a.createdAt) } }
    }
    return fail(404, 'Not found')
  }

  if (parts[0] !== 'groups') return fail(404, 'Not found')

  // --- create group (admin only) ---
  if (parts.length === 1 && m === 'POST') {
    requireAdmin()
    await write()
    const input = parse(createGroupIn, req.body)
    const id = newId(16)
    const k = keys(id)
    const createdAt = Date.now()
    await s.hset(k.meta, 'data', JSON.stringify({ name: input.name, currency: input.currency, createdAt } satisfies Meta))
    const seen = new Set<string>()
    let i = 0
    for (const n of input.members) {
      if (seen.has(n.toLowerCase())) continue
      seen.add(n.toLowerCase())
      const mid = newId()
      await s.hset(k.members, mid, JSON.stringify({ id: mid, name: n, createdAt: createdAt + i++ } satisfies Member))
    }
    await s.hset(ADMIN_INDEX, id, JSON.stringify({ name: input.name, createdAt }))
    await log(s, id, 'Admin', `created "${input.name}"`)
    await audit(s, id, { action: 'group.create', actor: 'Admin', after: { name: input.name, currency: input.currency, members: input.members } })
    await touch(s, id)
    return respondGroup(s, id, 201)
  }

  const id = parts[1]
  const k = keys(id)

  // --- read (cheap version check for polling) ---
  if (parts.length === 2 && m === 'GET') {
    await loadMeta(s, id)
    if ((await s.ttl(k.meta)) > 0) await keepForever(s, id)
    const have = req.query.v
    if (have) {
      const ver = await s.hget(k.meta, 'ver')
      if (ver === have) return { status: 200, body: { unchanged: true } }
    }
    return respondGroup(s, id)
  }

  // --- delete group (admin only) ---
  if (parts.length === 2 && m === 'DELETE') {
    requireAdmin()
    await loadMeta(s, id)
    await s.del(...Object.values(k))
    await s.hdel(ADMIN_INDEX, id)
    return { status: 200, body: { deleted: true } }
  }

  // --- admin log (admin only, read-only) ---
  if (parts[2] === 'audit' && parts.length === 3 && m === 'GET') {
    requireAdmin()
    await loadMeta(s, id)
    const entries = parseAll<AuditEntry>(await s.hgetall(k.audit)).sort((a, b) => b.at - a.at || b.seq - a.seq)
    return { status: 200, body: { entries } }
  }

  // everything below mutates a group that anyone with the link may edit
  if (m === 'GET') return fail(404, 'Not found')
  await loadMeta(s, id)
  await write()
  const kind = parts[2]
  const itemId = parts[3]

  // --- restore a deleted expense or payment from its log entry (admin only) ---
  if (kind === 'audit' && itemId && parts[4] === 'restore' && m === 'POST') {
    requireAdmin()
    const raw = await s.hget(k.audit, itemId)
    if (!raw) fail(404, 'Log entry not found')
    const entry = JSON.parse(raw!) as AuditEntry
    const target = entry.action === 'expense.delete' ? k.expenses : entry.action === 'settlement.delete' ? k.settlements : null
    if (!target || !entry.before) return fail(400, 'Only deleted expenses and payments can be restored')
    const item = entry.before as { id: string; description?: string }
    if (await s.hget(target, item.id)) fail(409, 'Already restored')
    await s.hset(target, item.id, JSON.stringify(item))
    const isExpense = target === k.expenses
    await log(s, id, 'Admin', isExpense ? `restored "${item.description}"` : 'restored a payment')
    await audit(s, id, { action: isExpense ? 'expense.restore' : 'settlement.restore', actor: 'Admin', after: item, ref: entry.id })
    await touch(s, id)
    return respondGroup(s, id)
  }

  if (kind === 'members' && m === 'POST' && !itemId) {
    const input = parse(memberIn, req.body)
    const members = parseAll<Member>(await s.hgetall(k.members))
    if (members.length >= MAX_MEMBERS) fail(400, 'This group is full')
    if (members.some((x) => x.name.toLowerCase() === input.name.toLowerCase())) fail(400, 'Someone with that name is already in the group')
    const mid = newId()
    const member = { id: mid, name: input.name, createdAt: Date.now() } satisfies Member
    await s.hset(k.members, mid, JSON.stringify(member))
    await log(s, id, input.actor ?? input.name, `${input.actor && input.actor !== input.name ? `added ${input.name}` : 'joined the group'}`)
    await audit(s, id, { action: 'member.add', actor: input.actor ?? input.name, device: input.device, after: member })
    await touch(s, id)
    return respondGroup(s, id, 201)
  }

  if (kind === 'expenses') {
    const members = parseAll<Member>(await s.hgetall(k.members))

    if (m === 'POST' && !itemId) {
      const input = parse(expenseIn, req.body)
      validateExpense(input, members)
      if ((await s.hlen(k.expenses)) >= MAX_EXPENSES) fail(400, 'Expense limit reached for this group')
      const eid = newId()
      const { actor: by, device: dev, ...fields } = input
      const item = { ...fields, id: eid, createdAt: Date.now() }
      await s.hset(k.expenses, eid, JSON.stringify(item))
      await log(s, id, by, `added "${input.description}"`)
      await audit(s, id, { action: 'expense.add', actor: by, device: dev, after: item })
      await touch(s, id)
      return respondGroup(s, id, 201)
    }

    if (m === 'PUT' && itemId) {
      const existing = await s.hget(k.expenses, itemId)
      if (!existing) fail(404, 'Expense not found')
      const input = parse(expenseIn, req.body)
      validateExpense(input, members)
      const { actor: by, device: dev, ...fields } = input
      const before = JSON.parse(existing!) as { createdAt: number }
      const item = { ...fields, id: itemId, createdAt: before.createdAt }
      await s.hset(k.expenses, itemId, JSON.stringify(item))
      await log(s, id, by, `updated "${input.description}"`)
      await audit(s, id, { action: 'expense.update', actor: by, device: dev, before, after: item })
      await touch(s, id)
      return respondGroup(s, id)
    }

    if (m === 'DELETE' && itemId) {
      const existing = await s.hget(k.expenses, itemId)
      if (!existing) fail(404, 'Expense not found')
      const who = whoIn.safeParse(req.body ?? {}).data
      const before = JSON.parse(existing!) as { description: string }
      await s.hdel(k.expenses, itemId)
      await log(s, id, who?.actor, `deleted "${before.description}"`)
      await audit(s, id, { action: 'expense.delete', actor: who?.actor, device: who?.device, before })
      await touch(s, id)
      return respondGroup(s, id)
    }
  }

  if (kind === 'settlements') {
    const members = parseAll<Member>(await s.hgetall(k.members))

    if (m === 'POST' && !itemId) {
      const input = parse(settlementIn, req.body)
      const ids = memberIds(members)
      if (!ids.has(input.fromId) || !ids.has(input.toId)) fail(400, 'Both people must be in this group')
      if (input.fromId === input.toId) fail(400, 'Choose two different people')
      notFuture(input.date)
      if ((await s.hlen(k.settlements)) >= MAX_SETTLEMENTS) fail(400, 'Payment limit reached for this group')
      const sid = newId()
      const { actor: by, device: dev, note, ...fields } = input
      const item = { ...fields, ...(note ? { note } : {}), id: sid, createdAt: Date.now() }
      await s.hset(k.settlements, sid, JSON.stringify(item))
      const nm = (x: string) => members.find((mm) => mm.id === x)?.name ?? '?'
      await log(s, id, by, `recorded that ${nm(input.fromId)} paid ${nm(input.toId)}`)
      await audit(s, id, { action: 'settlement.add', actor: by, device: dev, after: item })
      await touch(s, id)
      return respondGroup(s, id, 201)
    }

    if (m === 'DELETE' && itemId) {
      const existing = await s.hget(k.settlements, itemId)
      if (!existing) fail(404, 'Payment not found')
      const who = whoIn.safeParse(req.body ?? {}).data
      await s.hdel(k.settlements, itemId)
      await log(s, id, who?.actor, 'removed a payment')
      await audit(s, id, { action: 'settlement.delete', actor: who?.actor, device: who?.device, before: JSON.parse(existing!) })
      await touch(s, id)
      return respondGroup(s, id)
    }
  }

  return fail(404, 'Not found')
}
