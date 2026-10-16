import { useState } from 'react'
import { api } from '../lib/api'
import { Icon } from './icons'
import { Avatar, Button, ErrorText, inputCls, labelCls, Modal } from './ui'

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'JPY', 'SGD']

export function NewGroup({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [members, setMembers] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function addDraft(raw = draft) {
    const names = raw.split(',').map((s) => s.trim()).filter(Boolean)
    const next = [...members]
    for (const n of names) if (!next.some((m) => m.toLowerCase() === n.toLowerCase())) next.push(n)
    setMembers(next)
    setDraft('')
    return next
  }

  async function submit() {
    const list = draft.trim() ? addDraft() : members
    if (!name.trim()) return setError('Give the group a name.')
    if (list.length < 2) return setError('Add at least two people. Friends can add themselves later.')
    setBusy(true)
    try {
      const r = await api.createGroup(name.trim(), currency, list)
      onCreated(r.group.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create group')
      setBusy(false)
    }
  }

  return (
    <Modal title="New group" onClose={onClose}
      footer={<Button className="w-full" onClick={submit} disabled={busy}>{busy ? 'Creating…' : 'Create group'}</Button>}>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Avatar id={name || 'new'} name={name || '?'} size="lg" className="!rounded-2xl" />
          <input className={inputCls} placeholder="Group name, e.g. Goa trip" aria-label="Group name" autoFocus
            value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <span className={labelCls}>Currency</span>
          <div className="flex flex-wrap gap-2">
            {CURRENCIES.map((c) => (
              <button key={c} type="button" aria-pressed={currency === c} onClick={() => setCurrency(c)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  currency === c ? 'bg-white text-black' : 'bg-surface-2 text-muted hover:text-white'}`}>{c}</button>
            ))}
          </div>
        </div>

        <div>
          <span className={labelCls}>People · {members.length}</span>
          {members.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-2">
              {members.map((m) => (
                <li key={m} className="flex items-center gap-2 rounded-full bg-surface-2 py-1 pl-1 pr-2 text-sm font-medium">
                  <Avatar id={m} name={m} size="xs" />{m}
                  <button type="button" aria-label={`Remove ${m}`} className="text-muted hover:text-white"
                    onClick={() => setMembers(members.filter((x) => x !== m))}><Icon name="close" size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addDraft() }}>
            <input className={inputCls} placeholder="Add a name and press Enter" aria-label="Add person" value={draft}
              onChange={(e) => e.target.value.endsWith(',') ? addDraft(e.target.value) : setDraft(e.target.value)} />
            <Button type="submit" variant="icon" aria-label="Add person" className="!size-12 shrink-0" disabled={!draft.trim()}>
              <Icon name="plus" />
            </Button>
          </form>
        </div>
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  )
}
