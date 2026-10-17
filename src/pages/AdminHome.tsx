import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../components/icons'
import { NewGroup } from '../components/NewGroup'
import { Avatar, Button, ErrorText, inputCls, Spinner } from '../components/ui'
import { api, ApiError, type AdminGroup } from '../lib/api'
import { navigate } from '../lib/route'
import { copyText, toast } from '../lib/toast'

function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-accent to-fuchsia-500 shadow-lg shadow-accent/30 ${className}`}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
        <path d="M12 3v18M7 8l5-5 5 5M7 16l5 5 5-5" />
      </svg>
    </div>
  )
}

function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit() {
    setBusy(true)
    try { await api.login(pw); onDone() } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not sign in')
      setBusy(false)
    }
  }
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <Logo className="mb-6" />
      <h1 className="text-3xl font-extrabold tracking-tight">Splitler</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        Split shared expenses with friends. This is a private app. If a friend sent you a group link, open that link instead.
      </p>
      <form className="mt-8 space-y-3" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <div className="relative">
          <Icon name="lock" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input className={`${inputCls} pl-11`} type="password" placeholder="Admin password" aria-label="Admin password"
            value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        </div>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full" disabled={busy || !pw}>{busy ? 'Signing in…' : 'Sign in'}</Button>
      </form>
    </div>
  )
}

export function AdminHome() {
  const [admin, setAdmin] = useState<boolean | null>(null)
  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const me = await api.me()
      setAdmin(me.admin)
      if (me.admin) setGroups((await api.adminGroups()).groups)
    } catch { setAdmin(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  if (admin === null) return <Spinner />
  if (!admin) return <Login onDone={load} />

  const link = (id: string) => `${window.location.origin}/g/${id}`

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted">Splitler admin</p>
          <h1 className="text-3xl font-extrabold tracking-tight">Groups</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="icon" aria-label="Sign out" onClick={async () => { await api.logout(); setAdmin(false) }}>
            <Icon name="logout" size={18} />
          </Button>
          <Button variant="icon" aria-label="New group" className="!bg-accent hover:!bg-accent-hover" onClick={() => setCreating(true)}>
            <Icon name="plus" size={20} />
          </Button>
        </div>
      </header>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl bg-surface px-6 py-14 text-center">
          <div className="mb-4 grid size-16 place-items-center rounded-2xl bg-accent/15 text-accent">
            <Icon name="users" size={30} />
          </div>
          <h2 className="text-lg font-bold">No groups yet</h2>
          <p className="mt-1 max-w-xs text-sm text-muted">Create a group, then share its link on WhatsApp so friends can add expenses.</p>
          <Button className="mt-6" onClick={() => setCreating(true)}>Create a group</Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => (
            <li key={g.id} className="rounded-2xl bg-surface p-4">
              <button className="flex w-full items-center gap-3 text-left" onClick={() => navigate(`/g/${g.id}`)}>
                <Avatar id={g.id} name={g.name} size="md" className="!rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{g.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                    <Icon name="clock" size={12} /> Created {new Date(g.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <Icon name="back" size={18} className="rotate-180 text-muted" />
              </button>
              <div className="mt-4 flex gap-2 border-t border-line pt-3">
                <Button variant="ghost" className="flex flex-1 items-center justify-center gap-1.5 !py-2" onClick={async () => {
                  await copyText(link(g.id), 'Link copied')
                }}><Icon name="copy" size={16} /> Copy link</Button>
                <a className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#25d366]/15 py-2 text-sm font-semibold text-[#25d366] hover:bg-[#25d366]/25"
                  target="_blank" rel="noreferrer"
                  href={`https://wa.me/?text=${encodeURIComponent(`Add your expenses to "${g.name}" on Splitler: ${link(g.id)}`)}`}>
                  <Icon name="whatsapp" size={16} /> WhatsApp
                </a>
                <Button variant="danger" aria-label={`Delete ${g.name}`} className="!px-3 !py-2" onClick={async () => {
                  if (confirm(`Delete "${g.name}" for everyone?`)) { await api.deleteGroup(g.id); toast('Group deleted'); void load() }
                }}><Icon name="trash" size={16} /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {creating && <NewGroup onClose={() => setCreating(false)} onCreated={(id) => navigate(`/g/${id}`)} />}
    </div>
  )
}
