import { createContext, useContext } from 'react'
import type { ExpenseInput, SettlementInput } from './lib/api'
import type { Group } from './lib/types'

export interface GroupActions {
  saveExpense(input: ExpenseInput, existingId?: string): Promise<Group>
  deleteExpense(id: string): Promise<Group>
  addSettlement(input: SettlementInput): Promise<Group>
  deleteSettlement(id: string): Promise<Group>
  addMember(name: string): Promise<Group>
  /** admin only: undo a delete recorded in the admin log */
  restore(entryId: string): Promise<Group>
}

export interface GroupCtx {
  actions: GroupActions
  /** member id of the person using this device, if chosen */
  me: string | null
}

export const GroupContext = createContext<GroupCtx | null>(null)

export function useGroupCtx(): GroupCtx {
  const c = useContext(GroupContext)
  if (!c) throw new Error('GroupContext missing')
  return c
}
