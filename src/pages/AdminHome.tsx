import { useCallback, useEffect, useState } from 'react'
import { NewGroup } from '../components/NewGroup'
import { Button, Card, inputCls } from '../components/ui'
import { api, ApiError, formatExpiry, type AdminGroup } from '../lib/api'
import { navigate } from '../lib/route'

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
    <div className="mx-auto max-w-sm space-y-3 p-8">
      <h1 className="text-2xl font-bold">Splitler</h1>
      <p className="text-sm text-slate-500">
        This is a private app. If a friend sent you a group link, open that link instead.
      </p>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <input className={inputCls} type="password" placeholder="Admin password" aria-label="Admin password"
          value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <Button type="submit" disabled={busy || !pw}>Sign in</Button>
      </form>
    </div>
  )
}

export function AdminHome() {
  const [admin, setAdmin] = useState<boolean | null>(null)
  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState('')

  const load = useCallback(async () => {
    try {
      const me = await api.me()
      setAdmin(me.admin)
      if (me.admin) setGroups((await api.adminGroups()).groups)
    } catch { setAdmin(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  if (admin === null) return <p className="p-8 text-center text-slate-500">Loading…</p>
  if (!admin) return <Login onDone={load} />

  const link = (id: string) => `${window.location.origin}/g/${id}`

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Splitler</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={async () => { await api.logout(); setAdmin(false) }}>Sign out</Button>
          <Button onClick={() => setCreating(true)}>New group</Button>
        </div>
      </div>
      {groups.length === 0 ? (
        <p className="py-16 text-center text-slate-500">Create a group, then share its link on WhatsApp.</p>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <Card key={g.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button className="text-left" onClick={() => navigate(`/g/${g.id}`)}>
                  <p className="font-medium">{g.name}</p>
                  <p className="text-xs text-slate-500">Deleted in {formatExpiry(g.expiresIn)} without activity</p>
                </button>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" onClick={async () => {
                    await navigator.clipboard?.writeText(link(g.id))
                    setCopied(g.id)
                    setTimeout(() => setCopied(''), 1500)
                  }}>{copied === g.id ? 'Copied!' : 'Copy link'}</Button>
                  <a className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    target="_blank" rel="noreferrer"
                    href={`https://wa.me/?text=${encodeURIComponent(`Add your expenses to "${g.name}" on Splitler: ${link(g.id)}`)}`}>
                    WhatsApp
                  </a>
                  <Button variant="danger" onClick={async () => {
                    if (confirm(`Delete "${g.name}" for everyone?`)) { await api.deleteGroup(g.id); void load() }
                  }}>Delete</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {creating && <NewGroup onClose={() => setCreating(false)} onCreated={(id) => navigate(`/g/${id}`)} />}
    </div>
  )
}
