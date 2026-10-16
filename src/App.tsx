import { useState } from 'react'
import { GroupView } from './components/GroupView'
import { Button, Card, inputCls, Modal } from './components/ui'
import { StoreProvider, useStore } from './store/store'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD', 'JPY', 'SGD']

function NewGroup({ onClose }: { onClose: () => void }) {
  const { dispatch } = useStore()
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [members, setMembers] = useState('')
  const [error, setError] = useState('')

  function submit() {
    const list = members.split(',').map((s) => s.trim()).filter(Boolean)
    if (!name.trim()) return setError('Give the group a name.')
    if (list.length < 2) return setError('Add at least two people, separated by commas.')
    dispatch({ type: 'addGroup', name: name.trim(), currency, members: list })
    onClose()
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
          <Button onClick={submit}>Create</Button>
        </div>
      </div>
    </Modal>
  )
}

function Shell() {
  const { state, dispatch } = useStore()
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const group = state.groups.find((g) => g.id === openId)

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-900">
        Nothing is saved to a server. Your data lasts for this browser tab only and disappears when you close it.
      </div>

      {group ? (
        <GroupView group={group} onBack={() => setOpenId(null)} />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Splitly</h1>
            <div className="flex gap-2">
              {state.groups.length > 0 && (
                <Button variant="ghost" onClick={() => { if (confirm('Clear all data in this session?')) dispatch({ type: 'clear' }) }}>
                  Clear session
                </Button>
              )}
              <Button onClick={() => setCreating(true)}>New group</Button>
            </div>
          </div>
          {state.groups.length === 0 ? (
            <p className="py-16 text-center text-slate-500">Create a group to start splitting expenses.</p>
          ) : (
            <div className="space-y-2">
              {state.groups.map((g) => (
                <Card key={g.id}>
                  <div className="flex items-center justify-between">
                    <button className="flex-1 text-left" onClick={() => setOpenId(g.id)}>
                      <p className="font-medium">{g.name}</p>
                      <p className="text-xs text-slate-500">{g.members.length} people · {g.expenses.length} expenses · {g.currency}</p>
                    </button>
                    <Button variant="danger" onClick={() => { if (confirm(`Delete "${g.name}"?`)) dispatch({ type: 'deleteGroup', id: g.id }) }}>Delete</Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
      {creating && <NewGroup onClose={() => setCreating(false)} />}
    </div>
  )
}

export default function App() {
  return <StoreProvider><Shell /></StoreProvider>
}
