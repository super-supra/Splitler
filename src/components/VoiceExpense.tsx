import { useEffect, useRef, useState } from 'react'
import { useGroupCtx } from '../context'
import { api, type ExpenseInput, type VoiceDraft } from '../lib/api'
import { category } from '../lib/categories'
import { dayLabel, todayISO } from '../lib/format'
import { formatMoney } from '../lib/money'
import { computeSplit } from '../lib/splits'
import { toast } from '../lib/toast'
import type { Group } from '../lib/types'
import { Icon } from './icons'
import { Avatar, Button, ErrorText, MemberChip, Modal } from './ui'

/* The browser's speech engine is not in the TypeScript DOM lib. */
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
const SpeechCtor = (): (new () => Recognition) | undefined => {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

const EXAMPLE = '“I paid 3000 for dinner. Asha and Pulsar had 1000 each, the rest split equally.”'

export function VoiceExpense({ group, onClose, onEdit }: {
  group: Group; onClose: () => void; onEdit: (draft: ExpenseInput) => void
}) {
  const { actions, me } = useGroupCtx()
  const [text, setText] = useState('')
  const [interim, setInterim] = useState('')
  const [listening, setListening] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<VoiceDraft | null>(null)
  const [error, setError] = useState('')
  const rec = useRef<Recognition | null>(null)
  const supported = !!SpeechCtor()

  useEffect(() => () => rec.current?.stop(), [])

  function start() {
    const Ctor = SpeechCtor()
    if (!Ctor) return
    setError('')
    const r = new Ctor()
    r.lang = navigator.language || 'en-IN'
    r.continuous = true
    r.interimResults = true
    r.onresult = (e) => {
      let finals = ''
      let live = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) finals += t; else live += t
      }
      if (finals) setText((prev) => `${prev} ${finals}`.trim())
      setInterim(live)
    }
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setError('Microphone is blocked. Allow it in your browser, or type below.')
      else if (e.error !== 'aborted' && e.error !== 'no-speech') setError('Couldn’t hear that. Try again or type below.')
    }
    r.onend = () => { setListening(false); setInterim('') }
    rec.current = r
    setListening(true)
    try { r.start() } catch { setListening(false) }
  }

  function stop() { rec.current?.stop() }

  async function understand() {
    stop()
    const said = `${text} ${interim}`.trim()
    if (said.length < 3) return setError('Say or type what the expense was first.')
    setBusy(true)
    setError('')
    try {
      const { draft: d } = await api.parseVoice(group.id, said, me, todayISO())
      setText(said)
      setDraft(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t understand that')
    } finally {
      setBusy(false)
    }
  }

  const money = (n: number) => formatMoney(n, group.currency)

  if (draft) {
    const split = draft.payerId ? computeSplit(draft.amount, draft.splitType, draft.splitValues) : null
    const owed = split?.ok ? split.owed : {}
    const cat = category(draft.category)
    const people = group.members.filter((m) => m.id in draft.splitValues)
    const ready = !!draft.payerId && !!split?.ok
    async function confirm() {
      if (!draft) return
      setBusy(true)
      try {
        const { warnings: _w, ...input } = draft
        await actions.saveExpense(input)
        toast('Expense added')
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save')
        setBusy(false)
      }
    }
    return (
      <Modal title="Check the split" onClose={onClose}
        footer={
          <div className="space-y-2">
            <Button className="w-full" onClick={confirm} disabled={busy || !ready}>{busy ? 'Adding…' : 'Confirm and add'}</Button>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setDraft(null)} disabled={busy}>Speak again</Button>
              <Button variant="ghost" className="flex-1" onClick={() => onEdit(draft)} disabled={busy}>Edit details</Button>
            </div>
          </div>
        }>
        <div className="space-y-5">
          <p className="flex gap-2 text-sm italic text-muted">
            <Icon name="mic" size={14} className="mt-0.5 shrink-0" /> <span>“{text}”</span>
          </p>

          <div className="rounded-3xl bg-gradient-to-br from-accent/30 via-surface-3 to-surface-2 p-5 text-center ring-1 ring-white/10">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Total</p>
            <p className="mt-1 text-5xl font-extrabold tabular-nums tracking-tight">{money(draft.amount)}</p>
            <p className="mt-2 text-lg font-semibold">{draft.description}</p>
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-black/25 py-1 pl-1 pr-3 text-xs font-medium text-white/80">
              <span className={`grid size-5 place-items-center rounded-full ${cat.tint}`}><Icon name={cat.icon} size={12} /></span>
              {cat.id} · {dayLabel(new Date(`${draft.date}T00:00:00`).getTime())}
            </p>
          </div>

          <section>
            <h3 className="mb-2 text-sm font-bold">Who paid</h3>
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5">
              {group.members.map((m) => (
                <MemberChip key={m.id} id={m.id} name={m.name} label={m.id === me ? `${m.name} (you)` : m.name} size="xs"
                  selected={draft.payerId === m.id} onClick={() => setDraft({ ...draft, payerId: m.id })} />
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-bold">Split between {people.length}</h3>
              {!split?.ok && <span className="text-xs text-warn">Needs fixing</span>}
            </div>
            <ul className="space-y-2">
              {people.map((m) => {
                const v = owed[m.id] ?? 0
                const pct = draft.amount ? Math.round((v / draft.amount) * 100) : 0
                return (
                  <li key={m.id} className="rounded-2xl bg-surface-2 p-3 ring-1 ring-white/5">
                    <div className="flex items-center gap-3">
                      <Avatar id={m.id} name={m.name} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.name}{m.id === me && ' (you)'}</span>
                      <span className="text-base font-bold tabular-nums">{split?.ok ? money(v) : '—'}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/30">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>

          {draft.warnings.length > 0 && (
            <ul className="space-y-1 rounded-2xl bg-warn/15 px-4 py-3 text-sm font-medium text-warn ring-1 ring-warn/30">
              {draft.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
          <ErrorText>{error}</ErrorText>
        </div>
      </Modal>
    )
  }

  const shown = `${text} ${interim}`.trim()
  return (
    <Modal title="Speak your expense" onClose={onClose}
      footer={<Button className="w-full" onClick={understand} disabled={busy || shown.length < 3}>{busy ? 'Working it out…' : 'Show me the split'}</Button>}>
      <div className="space-y-4">
        {supported ? (
          <div className="flex flex-col items-center gap-4 pt-4">
            <div className="relative grid size-28 place-items-center">
              {listening && <>
                <span className="animate-ring absolute inset-0 rounded-full bg-neg/40" />
                <span className="animate-ring absolute inset-0 rounded-full bg-neg/40 [animation-delay:.5s]" />
              </>}
              <button type="button" onClick={listening ? stop : start} aria-label={listening ? 'Stop listening' : 'Start talking'}
                className={`relative grid size-24 place-items-center rounded-full text-white shadow-xl transition-colors ${
                  listening ? 'bg-neg shadow-neg/40' : 'bg-gradient-to-br from-accent to-fuchsia-500 shadow-accent/40'}`}>
                <Icon name={listening ? 'check' : 'mic'} size={38} />
              </button>
            </div>
            <p className="text-sm font-semibold">{listening ? 'Listening… tap when done' : text ? 'Tap to add more' : 'Tap and start talking'}</p>
          </div>
        ) : (
          <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">
            This browser can’t listen. Use the microphone key on your keyboard to dictate, or type below.
          </p>
        )}
        <div className="rounded-2xl bg-surface-2 p-1 ring-1 ring-white/10 focus-within:ring-accent/60">
          <textarea className="min-h-28 w-full resize-none rounded-xl bg-transparent px-3 py-2.5 text-[15px] outline-none placeholder:text-muted"
            aria-label="What you said" placeholder="Or type it here…"
            value={listening ? shown : text} onChange={(e) => setText(e.target.value)} readOnly={listening} />
        </div>
        {!text && !listening && (
          <div className="rounded-2xl bg-accent/10 px-4 py-3 text-sm text-white/80 ring-1 ring-accent/20">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Try saying</p>
            {EXAMPLE}
          </div>
        )}
        <p className="text-center text-xs text-muted">You’ll see the split before anything is saved.</p>
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  )
}
