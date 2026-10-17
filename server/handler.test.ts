import { beforeEach, describe, expect, it } from 'vitest'
import { handle, type Req, type Res } from './handler.js'
import { MemoryStore } from './store.js'

const env = { ADMIN_PASSWORD: 'pw-test', SESSION_SECRET: 'secret-test-secret' }
let now = 1_000_000
let store: MemoryStore

beforeEach(() => {
  now = 1_000_000
  store = new MemoryStore(() => now)
})

const call = (method: string, path: string, body?: unknown, extra: Partial<Req> = {}): Promise<Res> =>
  handle({ method, path, query: {}, body, cookies: {}, ip: '1.1.1.1', secure: false, ...extra }, store, env)

async function adminCookies() {
  const r = await call('POST', '/api/admin/login', { password: env.ADMIN_PASSWORD })
  const raw = r.headers!['Set-Cookie'].split(';')[0]
  const i = raw.indexOf('=')
  return { [raw.slice(0, i)]: raw.slice(i + 1) }
}

async function makeGroup() {
  const cookies = await adminCookies()
  const r = await call('POST', '/api/groups', { name: 'Trip', currency: 'USD', members: ['Asha', 'Ben', 'Chen'] }, { cookies })
  const { group } = (r.body as { group: { id: string; members: { id: string; name: string }[] } })
  return { cookies, group, id: group.id, ids: group.members.map((m) => m.id) }
}

const expense = (ids: string[], over: Record<string, unknown> = {}) => ({
  description: 'Dinner', amount: 3000, payerId: ids[0], date: '2026-10-16', category: 'Food',
  splitType: 'equal', splitValues: Object.fromEntries(ids.map((i) => [i, 1])), actor: 'Asha', ...over,
})

describe('admin gating', () => {
  it('rejects wrong password', async () => {
    expect((await call('POST', '/api/admin/login', { password: 'nope' })).status).toBe(401)
  })
  it('only admin can create groups', async () => {
    const body = { name: 'X', currency: 'USD', members: ['A', 'B'] }
    expect((await call('POST', '/api/groups', body)).status).toBe(401)
    expect((await call('POST', '/api/groups', body, { cookies: { splitler_admin: 'forged.token' } })).status).toBe(401)
    expect((await call('POST', '/api/groups', body, { cookies: await adminCookies() })).status).toBe(201)
  })
  it('only admin can list or delete groups', async () => {
    const { id } = await makeGroup()
    expect((await call('GET', '/api/admin/groups')).status).toBe(401)
    expect((await call('DELETE', `/api/groups/${id}`)).status).toBe(401)
  })
  it('rate-limits login attempts', async () => {
    let last = 0
    for (let i = 0; i < 12; i++) last = (await call('POST', '/api/admin/login', { password: 'bad' })).status
    expect(last).toBe(429)
  })
})

describe('shared group editing (no login)', () => {
  it('lets anyone with the link add an expense and see it', async () => {
    const { id, ids } = await makeGroup()
    expect((await call('POST', `/api/groups/${id}/expenses`, expense(ids))).status).toBe(201)
    const r = await call('GET', `/api/groups/${id}`)
    expect((r.body as { group: { expenses: unknown[] } }).group.expenses).toHaveLength(1)
  })
  it('404s for unknown or malformed ids', async () => {
    expect((await call('GET', '/api/groups/short')).status).toBe(404)
    expect((await call('GET', '/api/groups/' + 'a'.repeat(22))).status).toBe(404)
  })
  it('rejects bad splits and outsiders', async () => {
    const { id, ids } = await makeGroup()
    const post = (b: unknown) => call('POST', `/api/groups/${id}/expenses`, b)
    expect((await post(expense(ids, { splitType: 'exact', splitValues: { [ids[0]]: 1, [ids[1]]: 1 } }))).status).toBe(400)
    expect((await post(expense(ids, { payerId: 'stranger' }))).status).toBe(400)
    expect((await post(expense(ids, { splitValues: { stranger: 1 } }))).status).toBe(400)
    expect((await post(expense(ids, { amount: -5 }))).status).toBe(400)
  })
  it('edits and deletes expenses', async () => {
    const { id, ids } = await makeGroup()
    const created = await call('POST', `/api/groups/${id}/expenses`, expense(ids))
    const eid = (created.body as { group: { expenses: { id: string }[] } }).group.expenses[0].id
    expect((await call('PUT', `/api/groups/${id}/expenses/${eid}`, expense(ids, { amount: 6000 }))).status).toBe(200)
    const del = await call('DELETE', `/api/groups/${id}/expenses/${eid}`, { actor: 'Ben' })
    expect((del.body as { group: { expenses: unknown[] } }).group.expenses).toHaveLength(0)
  })
  it('adds members, rejecting duplicate names', async () => {
    const { id } = await makeGroup()
    expect((await call('POST', `/api/groups/${id}/members`, { name: 'Dev' })).status).toBe(201)
    expect((await call('POST', `/api/groups/${id}/members`, { name: 'dev' })).status).toBe(400)
  })
  it('records settlements', async () => {
    const { id, ids } = await makeGroup()
    expect((await call('POST', `/api/groups/${id}/settlements`, { fromId: ids[1], toId: ids[0], amount: 500, date: '2026-10-16' })).status).toBe(201)
    expect((await call('POST', `/api/groups/${id}/settlements`, { fromId: ids[1], toId: ids[1], amount: 500, date: '2026-10-16' })).status).toBe(400)
  })
  it('keeps both writes when two people add at the same time', async () => {
    const { id, ids } = await makeGroup()
    await Promise.all([
      call('POST', `/api/groups/${id}/expenses`, expense(ids, { description: 'A' }), { ip: '2.2.2.2' }),
      call('POST', `/api/groups/${id}/expenses`, expense(ids, { description: 'B' }), { ip: '3.3.3.3' }),
    ])
    const r = await call('GET', `/api/groups/${id}`)
    expect((r.body as { group: { expenses: unknown[] } }).group.expenses).toHaveLength(2)
  })
})

describe('payments', () => {
  it('stores an optional note and a backdated date, rejects future dates', async () => {
    const { id, ids } = await makeGroup()
    const pay = (over: Record<string, unknown>) =>
      call('POST', `/api/groups/${id}/settlements`, { fromId: ids[1], toId: ids[0], amount: 500, date: '2026-01-02', ...over })
    const r = await pay({ note: 'via GPay' })
    expect(r.status).toBe(201)
    const s = (r.body as { group: { settlements: { date: string; note?: string }[] } }).group.settlements[0]
    expect(s).toMatchObject({ date: '2026-01-02', note: 'via GPay' })
    expect((await pay({ date: '2999-01-01' })).status).toBe(400)
    expect((await pay({ note: 'x'.repeat(121) })).status).toBe(400)
  })
})

describe('admin log', () => {
  type Entry = { id: string; action: string; actor?: string; device?: string; before?: { id: string }; after?: unknown; ref?: string }
  const entries = async (id: string, cookies: Record<string, string>) =>
    ((await call('GET', `/api/groups/${id}/audit`, undefined, { cookies })).body as { entries: Entry[] }).entries

  it('is admin-only and never sent with the shared group', async () => {
    const { id } = await makeGroup()
    expect((await call('GET', `/api/groups/${id}/audit`)).status).toBe(401)
    const r = await call('GET', `/api/groups/${id}`)
    expect(JSON.stringify(r.body)).not.toContain('"action"')
  })

  it('records every change with actor, device and snapshots', async () => {
    const { id, ids, cookies } = await makeGroup()
    const created = await call('POST', `/api/groups/${id}/expenses`, expense(ids, { device: 'dev-1' }))
    const eid = (created.body as { group: { expenses: { id: string }[] } }).group.expenses[0].id
    await call('PUT', `/api/groups/${id}/expenses/${eid}`, expense(ids, { amount: 6000, actor: 'Ben', device: 'dev-2' }))
    await call('DELETE', `/api/groups/${id}/expenses/${eid}`, { actor: 'Chen', device: 'dev-3' })
    const log = await entries(id, cookies)
    expect(log.map((e) => e.action)).toEqual(['expense.delete', 'expense.update', 'expense.add', 'group.create'])
    expect(log[0]).toMatchObject({ actor: 'Chen', device: 'dev-3', before: { id: eid, amount: 6000 } })
    expect(log[1]).toMatchObject({ actor: 'Ben', before: { amount: 3000 }, after: { amount: 6000 } })
  })

  it('keeps every entry (no trimming)', async () => {
    const { id, ids, cookies } = await makeGroup()
    for (let i = 0; i < 210; i++) await call('POST', `/api/groups/${id}/members`, { name: `P${i}` }, { ip: `9.9.${i}.1` }).catch(() => {})
    for (let i = 0; i < 60; i++) await call('POST', `/api/groups/${id}/expenses`, expense(ids), { ip: `8.8.${i}.1` })
    expect((await entries(id, cookies)).filter((e) => e.action === 'expense.add')).toHaveLength(60)
  })

  it('lets only the admin restore a deleted expense or payment, once', async () => {
    const { id, ids, cookies } = await makeGroup()
    const created = await call('POST', `/api/groups/${id}/expenses`, expense(ids))
    const eid = (created.body as { group: { expenses: { id: string }[] } }).group.expenses[0].id
    await call('DELETE', `/api/groups/${id}/expenses/${eid}`, { actor: 'Ben' })
    const del = (await entries(id, cookies))[0]
    const restore = (c = {}) => call('POST', `/api/groups/${id}/audit/${del.id}/restore`, undefined, { cookies: c })
    expect((await restore()).status).toBe(401)
    const r = await restore(cookies)
    expect(r.status).toBe(200)
    expect((r.body as { group: { expenses: { id: string }[] } }).group.expenses.map((e) => e.id)).toEqual([eid])
    expect((await restore(cookies)).status).toBe(409)
    const log = await entries(id, cookies)
    expect(log[0]).toMatchObject({ action: 'expense.restore', ref: del.id })
    // the delete entry itself is untouched
    expect(log.find((e) => e.id === del.id)).toEqual(del)

    await call('POST', `/api/groups/${id}/settlements`, { fromId: ids[1], toId: ids[0], amount: 500, date: '2026-10-16' })
    const sid = ((await call('GET', `/api/groups/${id}`)).body as { group: { settlements: { id: string }[] } }).group.settlements[0].id
    await call('DELETE', `/api/groups/${id}/settlements/${sid}`, {})
    const sdel = (await entries(id, cookies))[0]
    expect(sdel.action).toBe('settlement.delete')
    expect((await call('POST', `/api/groups/${id}/audit/${sdel.id}/restore`, undefined, { cookies })).status).toBe(200)
  })

  it('refuses to restore entries that are not deletes', async () => {
    const { id, cookies } = await makeGroup()
    const create = (await entries(id, cookies))[0]
    expect((await call('POST', `/api/groups/${id}/audit/${create.id}/restore`, undefined, { cookies })).status).toBe(400)
  })
})

describe('polling and retention', () => {
  it('returns unchanged for the current version, new data after a write', async () => {
    const { id, ids } = await makeGroup()
    const first = (await call('GET', `/api/groups/${id}`)).body as { ver: string }
    const same = await call('GET', `/api/groups/${id}`, undefined, { query: { v: first.ver } })
    expect(same.body).toEqual({ unchanged: true })
    await call('POST', `/api/groups/${id}/expenses`, expense(ids))
    const after = await call('GET', `/api/groups/${id}`, undefined, { query: { v: first.ver } })
    expect((after.body as { unchanged?: boolean }).unchanged).toBeUndefined()
  })
  it('keeps groups forever', async () => {
    const { id, ids } = await makeGroup()
    await call('POST', `/api/groups/${id}/expenses`, expense(ids))
    for (const part of ['meta', 'members', 'expenses', 'activity', 'audit']) expect(await store.ttl(`g:${id}:${part}`)).toBe(-1)
    now += 365 * 24 * 3600 * 1000
    expect((await call('GET', `/api/groups/${id}`)).status).toBe(200)
  })
  it('makes groups that still carry the old 7-day expiry permanent on read', async () => {
    const { id } = await makeGroup()
    for (const part of ['meta', 'members', 'activity']) await store.expire(`g:${id}:${part}`, 7 * 24 * 3600)
    expect(await store.ttl(`g:${id}:meta`)).toBeGreaterThan(0)
    await call('GET', `/api/groups/${id}`)
    expect(await store.ttl(`g:${id}:meta`)).toBe(-1)
    expect(await store.ttl(`g:${id}:members`)).toBe(-1)
  })
  it('makes old expiring groups permanent when the admin lists them, and drops deleted ones', async () => {
    const { id, cookies } = await makeGroup()
    await store.expire(`g:${id}:meta`, 7 * 24 * 3600)
    const list = async () => ((await call('GET', '/api/admin/groups', undefined, { cookies })).body as { groups: unknown[] }).groups
    expect(await list()).toHaveLength(1)
    expect(await store.ttl(`g:${id}:meta`)).toBe(-1)
    await call('DELETE', `/api/groups/${id}`, undefined, { cookies })
    expect(await list()).toHaveLength(0)
  })
})

describe('resolveRoute', () => {
  it('uses the real path locally and the rewritten __p param on Vercel', async () => {
    const { resolveRoute } = await import('./node.js')
    expect(resolveRoute('/api/groups/abc?v=1')).toEqual({ path: '/api/groups/abc', query: { v: '1' } })
    expect(resolveRoute('/api?__p=groups/abc&v=1')).toEqual({ path: '/api/groups/abc', query: { v: '1' } })
    expect(resolveRoute('/api?__p=admin/me')).toEqual({ path: '/api/admin/me', query: {} })
  })
})

describe('toHash (Upstash HGETALL shapes)', () => {
  it('converts a flat array and passes objects through', async () => {
    const { toHash } = await import('./store.js')
    expect(toHash(['a', '{"x":1}', 'b', '2'])).toEqual({ a: '{"x":1}', b: '2' })
    expect(toHash({ a: '1' })).toEqual({ a: '1' })
    expect(toHash(null)).toEqual({})
    expect(toHash([])).toEqual({})
  })
})
