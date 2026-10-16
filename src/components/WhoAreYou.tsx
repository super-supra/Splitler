import { useState } from 'react'
import type { Group } from '../lib/types'
import { Icon } from './icons'
import { Avatar, Button, ErrorText, inputCls, Modal } from './ui'

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
    <Modal title="Who are you?" onClose={() => {}} dismissable={false}>
      <p className="mb-4 text-sm text-muted">Pick your name in “{group.name}”. This device will remember it.</p>
      <ul className="mb-5 overflow-hidden rounded-2xl bg-surface-2/50">
        {group.members.map((m) => (
          <li key={m.id} className="border-b border-line last:border-0">
            <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[.04]" onClick={() => onPick(m.id)}>
              <Avatar id={m.id} name={m.name} />
              <span className="flex-1 font-semibold">{m.name}</span>
              <Icon name="back" size={18} className="rotate-180 text-muted" />
            </button>
          </li>
        ))}
      </ul>
      <p className="mb-2 text-sm font-semibold">Not in the list?</p>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void add() }}>
        <input className={inputCls} placeholder="Your name" aria-label="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" disabled={busy || !name.trim()}>Join</Button>
      </form>
      <div className="mt-3"><ErrorText>{error}</ErrorText></div>
    </Modal>
  )
}
