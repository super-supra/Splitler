import { useState } from 'react'
import type { Group } from '../lib/types'
import { Button, inputCls } from './ui'

/** Blocking picker shown on first visit so expenses and the activity log can say who did what. */
export function WhoAreYou({ group, onPick, onAdd }: {
  group: Group
  onPick: (memberId: string) => void
  onAdd: (name: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function add() {
    if (!name.trim()) return
    setBusy(true)
    try { await onAdd(name.trim()) } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add you')
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-label="Who are you?" className="w-full max-w-sm rounded-2xl bg-white p-5 dark:bg-slate-900">
        <h2 className="text-lg font-semibold">Who are you?</h2>
        <p className="mb-3 text-sm text-slate-500">Pick your name in “{group.name}”. This device will remember it.</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {group.members.map((m) => (
            <Button key={m.id} variant="ghost" onClick={() => onPick(m.id)}>{m.name}</Button>
          ))}
        </div>
        <p className="mb-1 text-sm text-slate-500">Not in the list?</p>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void add() }}>
          <input className={inputCls} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={busy}>Join</Button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
      </div>
    </div>
  )
}
