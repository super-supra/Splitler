import type { Expense, Group, Settlement } from './types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface GroupPayload {
  group: Group
  ver: string
  /** seconds until the group is auto-deleted */
  expiresIn: number
}

export interface AdminGroup {
  id: string
  name: string
  createdAt: number
  expiresIn: number
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? 'Request failed')
  return data as T
}

export type ExpenseInput = Omit<Expense, 'id'>
export type SettlementInput = Omit<Settlement, 'id'>

export const api = {
  me: () => call<{ admin: boolean }>('GET', '/api/admin/me'),
  login: (password: string) => call<{ admin: boolean }>('POST', '/api/admin/login', { password }),
  logout: () => call<{ admin: boolean }>('POST', '/api/admin/logout'),
  adminGroups: () => call<{ groups: AdminGroup[] }>('GET', '/api/admin/groups'),
  createGroup: (name: string, currency: string, members: string[]) =>
    call<GroupPayload>('POST', '/api/groups', { name, currency, members }),
  deleteGroup: (id: string) => call<{ deleted: boolean }>('DELETE', `/api/groups/${id}`),

  getGroup: (id: string, ver?: string) =>
    call<GroupPayload | { unchanged: true }>('GET', `/api/groups/${id}${ver ? `?v=${encodeURIComponent(ver)}` : ''}`),
  addMember: (id: string, name: string, actor?: string) =>
    call<GroupPayload>('POST', `/api/groups/${id}/members`, { name, actor }),
  createExpense: (id: string, e: ExpenseInput, actor?: string) =>
    call<GroupPayload>('POST', `/api/groups/${id}/expenses`, { ...e, actor }),
  updateExpense: (id: string, eid: string, e: ExpenseInput, actor?: string) =>
    call<GroupPayload>('PUT', `/api/groups/${id}/expenses/${eid}`, { ...e, actor }),
  deleteExpense: (id: string, eid: string, actor?: string) =>
    call<GroupPayload>('DELETE', `/api/groups/${id}/expenses/${eid}`, { actor }),
  createSettlement: (id: string, s: SettlementInput, actor?: string) =>
    call<GroupPayload>('POST', `/api/groups/${id}/settlements`, { ...s, actor }),
  deleteSettlement: (id: string, sid: string, actor?: string) =>
    call<GroupPayload>('DELETE', `/api/groups/${id}/settlements/${sid}`, { actor }),
}

export function formatExpiry(seconds: number): string {
  if (seconds < 0) return 'unknown'
  const days = Math.ceil(seconds / 86400)
  if (seconds >= 86400) return `${days} day${days === 1 ? '' : 's'}`
  const hours = Math.max(1, Math.ceil(seconds / 3600))
  return `${hours} hour${hours === 1 ? '' : 's'}`
}
