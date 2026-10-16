import { useState } from 'react'
import { fromMinor, toMinor } from '../lib/money'
import type { Group, Transfer } from '../lib/types'
import { useGroupCtx } from '../context'
import { Button, inputCls, Modal } from './ui'

export function SettleForm({ group, preset, onClose }: { group: Group; preset?: Transfer; onClose: () => void }) {
  const { actions } = useGroupCtx()
  const [busy, setBusy] = useState(false)
  const [from, setFrom] = useState(preset?.from ?? group.members[0]?.id ?? '')
  const [to, setTo] = useState(preset?.to ?? group.members[1]?.id ?? group.members[0]?.id ?? '')
  const [amount, setAmount] = useState(preset ? fromMinor(preset.amount) : '')
  const [error, setError] = useState('')

  async function submit() {
    const amt = toMinor(amount)
    if (from === to) return setError('Choose two different people.')
    if (amt === null || amt <= 0) return setError('Enter a valid amount.')
    setBusy(true)
    try {
      await actions.addSettlement({ fromId: from, toId: to, amount: amt, date: new Date().toISOString().slice(0, 10) })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      setBusy(false)
    }
  }

  const opts = group.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)
  return (
    <Modal title="Settle up" onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-xs text-slate-500">Payer
          <select className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)}>{opts}</select></label>
        <label className="block text-xs text-slate-500">Paid to
          <select className={inputCls} value={to} onChange={(e) => setTo(e.target.value)}>{opts}</select></label>
        <input className={inputCls} placeholder="Amount" inputMode="decimal" aria-label="Amount" value={amount}
          onChange={(e) => setAmount(e.target.value)} />
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Record payment</Button>
        </div>
      </div>
    </Modal>
  )
}
