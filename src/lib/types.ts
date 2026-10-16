export type SplitType = 'equal' | 'exact' | 'percent' | 'shares'

export interface Person {
  id: string
  name: string
}

export interface Expense {
  id: string
  description: string
  /** integer minor units (cents) */
  amount: number
  payerId: string
  date: string
  category: string
  splitType: SplitType
  /** personId -> value. equal: 1 per included person; exact: cents; percent: %; shares: weight */
  splitValues: Record<string, number>
}

export interface Settlement {
  id: string
  fromId: string
  toId: string
  amount: number
  date: string
  note?: string
}

export interface ActivityItem {
  id: string
  at: number
  text: string
}

export interface Group {
  id: string
  name: string
  currency: string
  members: Person[]
  expenses: Expense[]
  settlements: Settlement[]
  activity: ActivityItem[]
}

export interface Transfer {
  from: string
  to: string
  amount: number
}
