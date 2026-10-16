import { useState } from 'react'
import { currencySymbol, todayISO } from '../lib/format'
import { formatMoney, fromMinor, toMinor } from '../lib/money'
import { toast } from '../lib/toast'
import type { Group, Transfer } from '../lib/types'
import { useGroupCtx } from '../context'
import { Icon } from './icons'
import { AmountInput, Avatar, Button, ErrorText, inputCls, labelCls, MemberChip, Modal } from './ui'

export function SettleForm({ group, transfers, preset, onClose }: {
  group: Group; transfers: Transfer[]; preset?: Transfer; onClose: () => void
}) {
  const { actions, me } = useGroupCtx()
  const [busy, setBusy] = useState(false)
  const [from, setFrom] = useState(preset?.from ?? me ?? group.members[0]?.id ?? '')
  const [to, setTo] = useState(preset?.to ?? group.members.find((m) => m.id !== (preset?.from ?? me ?? group.members[0]?.id))?.id ?? '')
  const [amount, setAmount] = useState(preset ? fromMinor(preset.amount) : '')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [picking, setPicking] = useState<'from' | 'to' | null>(null)
  const [error, setError] = useState('')

  const person = (id: string) => group.members.find((m) => m.id === id)
  const who = (id: string) => (id === me ? 'You' : person(id)?.name ?? '?')

  // what the current user owes and is owed (everything, if they haven't picked a name)
  const suggestions = me ? transfers.filter((t) => t.from === me || t.to === me) : transfers
  const amt = toMinor(amount)
  const isPicked = (t: Transfer) => t.from === from && t.to === to && amt === t.amount
  function pick(t: Transfer) {
    setFrom(t.from)
    setTo(t.to)
    setAmount(fromMinor(t.amount))
    setPicking(null)
    setError('')
  }

  async function submit() {
    const amt = toMinor(amount)
    if (from === to) return setError('Choose two different people.')
    if (amt === null || amt <= 0) return setError('Enter a valid amount.')
    if (!date || date > todayISO()) return setError('Pick a date that isn’t in the future.')
    setBusy(true)
    try {
      await actions.addSettlement({ fromId: from, toId: to, amount: amt, date, ...(note.trim() ? { note: note.trim() } : {}) })
      toast('Payment recorded')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      setBusy(false)
    }
  }

  const side = (which: 'from' | 'to', id: string, caption: string) => {
    const p = person(id)
    return (
      <button type="button" onClick={() => setPicking(picking === which ? null : which)}
        className={`flex w-28 flex-col items-center gap-2 rounded-2xl p-3 transition-colors ${picking === which ? 'bg-accent/15 ring-1 ring-accent' : 'hover:bg-surface-2'}`}>
        {p ? <Avatar id={p.id} name={p.name} size="lg" /> : <span className="size-14 rounded-full bg-surface-3" />}
        <span className="text-xs text-muted">{caption}</span>
        <span className="max-w-full truncate text-sm font-semibold">{p ? (p.id === me ? 'You' : p.name) : 'Choose'}</span>
      </button>
    )
  }

  return (
    <Modal title="Settle up" onClose={onClose}
      footer={<Button className="w-full" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Record payment'}</Button>}>
      <div className="space-y-5">
        <div className="flex items-center justify-center gap-2 pt-2">
          {side('from', from, 'Payer')}
          <span className="grid size-9 place-items-center rounded-full bg-surface-2 text-muted"><Icon name="arrow" size={18} /></span>
          {side('to', to, 'Paid to')}
        </div>

        {picking && (
          <div className="animate-fade">
            <span className={labelCls}>{picking === 'from' ? 'Who paid?' : 'Who received it?'}</span>
            <div className="flex flex-wrap gap-2">
              {group.members.map((m) => (
                <MemberChip key={m.id} id={m.id} name={m.name} size="xs"
                  selected={(picking === 'from' ? from : to) === m.id}
                  onClick={() => { (picking === 'from' ? setFrom : setTo)(m.id); setPicking(null) }} />
              ))}
            </div>
          </div>
        )}

        {suggestions.length > 0 ? (
          <div>
            <span className={labelCls}>{me ? 'Your balances · tap to fill' : 'Suggested payments · tap to fill'}</span>
            <ul className="space-y-1.5">
              {suggestions.map((t) => {
                const other = t.from === me ? t.to : t.from
                const on = isPicked(t)
                return (
                  <li key={`${t.from}-${t.to}`}>
                    <button type="button" aria-pressed={on} onClick={() => pick(t)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                        on ? 'bg-accent/15 ring-1 ring-accent' : 'bg-surface-2/60 hover:bg-surface-2'}`}>
                      <Avatar id={other} name={person(other)?.name ?? '?'} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm text-muted">
                        {t.from === me ? <>You pay <b className="text-white">{who(t.to)}</b></>
                          : t.to === me ? <><b className="text-white">{who(t.from)}</b> pays you</>
                          : <><b className="text-white">{who(t.from)}</b> pays <b className="text-white">{who(t.to)}</b></>}
                      </span>
                      <span className={`text-sm font-semibold tabular-nums ${t.from === me ? 'text-neg' : t.to === me ? 'text-pos' : ''}`}>
                        {formatMoney(t.amount, group.currency)}
                      </span>
                      <span className={`grid size-5 place-items-center rounded-full border-2 ${on ? 'border-accent bg-accent text-white' : 'border-surface-3'}`}>
                        {on && <Icon name="check" size={11} strokeWidth={3} />}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : (
          <p className="rounded-xl bg-surface-2/60 px-3 py-2.5 text-center text-sm text-muted">
            {me ? 'You’re all settled — nothing suggested.' : 'Everyone is settled up.'}
          </p>
        )}

        <div className="py-2">
          <AmountInput symbol={currencySymbol(group.currency)} value={amount} onChange={setAmount} autoFocus={!preset} />
        </div>
        <div className="space-y-3 rounded-2xl bg-surface-2/50 p-4">
          <label className="block">
            <span className={labelCls}>When was it paid?</span>
            <input className={inputCls} type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="block">
            <span className={labelCls}>Note (optional)</span>
            <input className={inputCls} placeholder="e.g. via GPay" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <p className="text-center text-xs text-muted">This records a payment made outside Splitler, like cash or UPI.</p>
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  )
}
