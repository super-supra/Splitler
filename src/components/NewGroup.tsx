import { useState } from 'react'
import { api } from '../lib/api'
import { Button, inputCls, Modal } from './ui'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD', 'JPY', 'SGD']

export function NewGroup({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [members, setMembers] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const list = members.split(',').map((s) => s.trim()).filter(Boolean)
    if (!name.trim()) return setError('Give the group a name.')
    if (list.length < 2) return setError('Add at least two people, separated by commas. Friends can add themselves later.')
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
    <Modal title="New group" onClose={onClose}>
      <div className="space-y-3">
        <input className={inputCls} placeholder="Group name (e.g. Goa trip)" value={name} onChange={(e) => setName(e.target.value)} />
        <select className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Currency">
          {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input className={inputCls} placeholder="People, comma separated (Asha, Ben, Chen)" value={members}
          onChange={(e) => setMembers(e.target.value)} />
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Create</Button>
        </div>
      </div>
    </Modal>
  )
}
