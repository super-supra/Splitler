import { z } from 'zod'
import { allocate, computeSplit } from '../src/lib/splits.js'

const CATEGORY_IDS = ['General', 'Food', 'Groceries', 'Transport', 'Stay', 'Fun', 'Bills']
const MODEL = 'llama-3.3-70b-versatile'

export interface VoiceMember { id: string; name: string }

export interface VoiceDraft {
  description: string
  amount: number
  payerId: string
  category: string
  date: string
  splitType: 'equal' | 'exact' | 'percent' | 'shares'
  splitValues: Record<string, number>
  /** things the model said that we could not match; shown to the user before confirming */
  warnings: string[]
}

const llmOut = z.object({
  description: z.string().optional(),
  amount: z.number().optional(),
  category: z.string().optional(),
  date: z.string().optional(),
  payer: z.string().optional(),
  split: z.enum(['equal', 'exact', 'percent', 'shares']).optional(),
  people: z.array(z.object({ name: z.string(), value: z.number().optional() })).optional(),
  restPeople: z.array(z.string()).optional(),
  everyone: z.boolean().optional(),
}).passthrough()

export function systemPrompt(currency: string, members: VoiceMember[], today: string) {
  return `You turn a spoken description of a shared expense into JSON. Reply with JSON only.

Group members: ${members.map((m) => m.name).join(', ')}.
The speaker is referred to as "me" / "I". Currency: ${currency}. Today is ${today}.

JSON shape:
{
  "description": short title, e.g. "Dinner at Toscana",
  "amount": total as a plain number in major units (e.g. 3000 or 249.50),
  "category": one of ${CATEGORY_IDS.join(', ')},
  "date": "YYYY-MM-DD" only if the speaker mentioned a day (e.g. yesterday), else omit,
  "payer": member name who paid, or "me" for the speaker,
  "split": "equal" | "exact" | "percent" | "shares",
  "everyone": true if it is split among all members,
  "people": [{ "name": member name or "me", "value": number }],
  "restPeople": names that share whatever is left over equally
}

Rules:
- equal: list the people who share it (or set everyone true). No values.
- exact: "value" is that person's amount in major units. If some people have fixed amounts and the others share the rest, list the fixed ones in "people" and the others in "restPeople"; do NOT do the subtraction yourself.
- percent: "value" is the percentage. shares: "value" is the weight (e.g. "double" = 2).
- Use member names exactly as listed. Never invent people or numbers. If something is not said, omit it.
- Words like "lakh", "k", "thousand" are amounts: 2k = 2000, 1.5 lakh = 150000.`
}

function findMember(name: string, members: VoiceMember[], meId: string | undefined): string | null {
  const n = name.trim().toLowerCase()
  if (!n) return null
  if (['me', 'i', 'myself', 'my'].includes(n)) return meId ?? null
  const exact = members.find((m) => m.name.toLowerCase() === n)
  if (exact) return exact.id
  const starts = members.filter((m) => m.name.toLowerCase().startsWith(n) || n.startsWith(m.name.toLowerCase().split(' ')[0]))
  return starts.length === 1 ? starts[0].id : null
}

const toMinorNum = (x: number) => Math.round(x * 100)

/** Turn the model's loose JSON into an expense the app can validate. Never trusts its arithmetic. */
export function toDraft(raw: unknown, members: VoiceMember[], meId: string | undefined, today: string): VoiceDraft {
  const parsed = llmOut.safeParse(raw)
  if (!parsed.success) throw new Error('unreadable')
  const o = parsed.data
  const warnings: string[] = []

  if (!o.amount || !Number.isFinite(o.amount) || o.amount <= 0) throw new Error('no-amount')
  const amount = toMinorNum(o.amount)

  const payerId = o.payer ? findMember(o.payer, members, meId) : meId ?? null
  if (!payerId) {
    if (o.payer) warnings.push(`Couldn’t tell who “${o.payer}” is. Pick who paid.`)
    else warnings.push('Who paid wasn’t clear. Pick who paid.')
  }

  const split = o.split ?? 'equal'
  const ids = (names: string[] | undefined) => {
    const out: string[] = []
    for (const n of names ?? []) {
      const id = findMember(n, members, meId)
      if (!id) warnings.push(`Skipped “${n}”, who isn’t in this group.`)
      else if (!out.includes(id)) out.push(id)
    }
    return out
  }

  let splitType: VoiceDraft['splitType'] = split
  const values: Record<string, number> = {}

  if (o.everyone || (split === 'equal' && !(o.people?.length))) {
    splitType = 'equal'
    for (const m of members) values[m.id] = 1
  } else if (split === 'equal') {
    for (const id of ids(o.people?.map((p) => p.name))) values[id] = 1
  } else {
    for (const p of o.people ?? []) {
      const id = findMember(p.name, members, meId)
      if (!id) { warnings.push(`Skipped “${p.name}”, who isn’t in this group.`); continue }
      if (p.value === undefined || !Number.isFinite(p.value) || p.value < 0) { warnings.push(`No amount heard for ${p.name}.`); continue }
      values[id] = split === 'exact' ? toMinorNum(p.value) : p.value
    }
    if (split === 'exact') {
      const rest = ids(o.restPeople).filter((id) => !(id in values))
      const fixed = Object.values(values).reduce((a, b) => a + b, 0)
      if (rest.length > 0) {
        const left = amount - fixed
        if (left < 0) warnings.push('The amounts you named add up to more than the total.')
        else allocate(left, rest.map(() => 1)).forEach((v, i) => { values[rest[i]] = v })
      }
    }
  }

  if (Object.keys(values).length === 0) {
    warnings.push('Couldn’t tell who to split with. Everyone is selected.')
    splitType = 'equal'
    for (const m of members) values[m.id] = 1
  } else if (!computeSplit(amount, splitType, values).ok) {
    // the numbers heard don't add up: fall back to an equal split among the same people and say so
    warnings.push('The split you described didn’t add up to the total, so it is shown as equal. Adjust below.')
    const keep = Object.keys(values)
    splitType = 'equal'
    for (const k of Object.keys(values)) delete values[k]
    for (const id of keep) values[id] = 1
  }

  const category = CATEGORY_IDS.includes(o.category ?? '') ? o.category! : 'General'
  const date = o.date && /^\d{4}-\d{2}-\d{2}$/.test(o.date) && o.date <= today ? o.date : today
  const description = (o.description ?? '').trim().slice(0, 100) || 'Expense'

  return { description, amount, payerId: payerId ?? '', category, date, splitType, splitValues: values, warnings }
}

export async function askModel(apiKey: string, system: string, transcript: string): Promise<unknown> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: transcript }],
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (res.status === 429) throw new Error('busy')
  if (!res.ok) throw new Error('upstream')
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('unreadable')
  return JSON.parse(text)
}
