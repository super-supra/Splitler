import { beforeEach, describe, expect, it } from 'vitest'
import { handle, TTL_SECONDS, type Req, type Res } from './handler.js'
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

describe('polling and expiry', () => {
  it('returns unchanged for the current version, new data after a write', async () => {
    const { id, ids } = await makeGroup()
    const first = (await call('GET', `/api/groups/${id}`)).body as { ver: string }
    const same = await call('GET', `/api/groups/${id}`, undefined, { query: { v: first.ver } })
    expect(same.body).toEqual({ unchanged: true })
    await call('POST', `/api/groups/${id}/expenses`, expense(ids))
    const after = await call('GET', `/api/groups/${id}`, undefined, { query: { v: first.ver } })
    expect((after.body as { unchanged?: boolean }).unchanged).toBeUndefined()
  })
  it('sets a 7-day TTL, refreshes it on write, and deletes after expiry', async () => {
    const { id, ids } = await makeGroup()
    expect(await store.ttl(`g:${id}:meta`)).toBe(TTL_SECONDS)
    now += 5 * 24 * 3600 * 1000
    expect(await store.ttl(`g:${id}:meta`)).toBe(TTL_SECONDS - 5 * 24 * 3600)
    await call('POST', `/api/groups/${id}/expenses`, expense(ids))
    expect(await store.ttl(`g:${id}:meta`)).toBe(TTL_SECONDS)
    expect(await store.ttl(`g:${id}:expenses`)).toBe(TTL_SECONDS)
    now += 8 * 24 * 3600 * 1000
    expect((await call('GET', `/api/groups/${id}`)).status).toBe(404)
  })
  it('drops expired groups from the admin list', async () => {
    const { cookies } = await makeGroup()
    now += 8 * 24 * 3600 * 1000
    const r = await call('GET', '/api/admin/groups', undefined, { cookies })
    expect((r.body as { groups: unknown[] }).groups).toHaveLength(0)
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
