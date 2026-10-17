import { useEffect, useState } from 'react'
import { AdminLog } from '../components/AdminLog'
import { GroupView } from '../components/GroupView'
import { Icon } from '../components/icons'
import { Avatar, Button } from '../components/ui'
import { WhoAreYou } from '../components/WhoAreYou'
import { GroupContext } from '../context'
import { useGroupSync } from '../hooks/useGroupSync'
import { api } from '../lib/api'
import { navigate } from '../lib/route'
import { copyText } from '../lib/toast'

const meKey = (id: string) => `splitler-me-${id}`

function readMe(id: string): string | null {
  try { return localStorage.getItem(meKey(id)) } catch { return null }
}

function Skeleton() {
  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 pt-6" aria-label="Loading">
      <div className="skeleton h-10 w-24 rounded-full" />
      <div className="skeleton h-9 w-2/3 rounded-xl" />
      <div className="skeleton h-5 w-1/2 rounded-lg" />
      <div className="skeleton mt-6 h-11 rounded-full" />
      {[0, 1, 2].map((i) => <div key={i} className="skeleton h-16 rounded-2xl" />)}
    </div>
  )
}

export function GroupPage({ id }: { id: string }) {
  const [meId, setMeId] = useState<string | null>(() => readMe(id))
  const [isAdmin, setIsAdmin] = useState(false)
  const [showLog, setShowLog] = useState(false)
  // actor name is resolved lazily so mutations always label the current identity
  const [nameRef] = useState({ current: undefined as string | undefined })
  const { group, status, actions } = useGroupSync(id, () => nameRef.current)

  useEffect(() => { api.me().then((r) => setIsAdmin(r.admin)).catch(() => {}) }, [])

  const me = group?.members.find((m) => m.id === meId) ?? null
  nameRef.current = me?.name

  function pick(memberId: string) {
    setMeId(memberId)
    try { localStorage.setItem(meKey(id), memberId) } catch { /* private mode */ }
  }

  if (status === 'loading') return <Skeleton />
  if (status === 'notfound' || !group) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
        <div className="mb-5 grid size-16 place-items-center rounded-2xl bg-surface text-muted">
          <Icon name="ghost" size={30} />
        </div>
        <h1 className="text-xl font-bold">This group doesn’t exist</h1>
        <p className="mt-2 text-sm text-muted">It may have been deleted. Ask the admin for a new link.</p>
        {status === 'error' && <p className="mt-3 text-sm text-neg">Couldn’t reach the server.</p>}
      </div>
    )
  }

  async function share() {
    const url = window.location.href
    if (navigator.share) {
      try { await navigator.share({ title: group!.name, text: `Add your expenses to "${group!.name}" on Splitler`, url }) } catch { /* cancelled */ }
    } else {
      await copyText(url, 'Link copied')
    }
  }

  return (
    <GroupContext.Provider value={{ actions, me: me?.id ?? null }}>
      <div className="mx-auto max-w-xl px-4 pb-16 pt-[max(1rem,env(safe-area-inset-top))]">
        <nav className="mb-5 flex items-center justify-between">
          {isAdmin ? (
            <Button variant="icon" aria-label="Admin home" onClick={() => navigate('/')}><Icon name="back" /></Button>
          ) : <span />}
          <div className="flex items-center gap-2">
            {me && (
              <button onClick={() => setMeId(null)} title="Switch person"
                className="flex items-center gap-2 rounded-full bg-surface-2 py-1 pl-1 pr-3 text-sm hover:bg-surface-3">
                <Avatar id={me.id} name={me.name} size="xs" />
                <span className="text-muted">You’re</span> <span className="font-semibold">{me.name}</span>
              </button>
            )}
            {isAdmin && (
              <Button variant="icon" aria-label="Admin log" title="Admin log" onClick={() => setShowLog(true)}>
                <Icon name="lock" size={18} />
              </Button>
            )}
            <Button variant="icon" aria-label="Share group link" onClick={share}><Icon name="share" size={18} /></Button>
          </div>
        </nav>

        <GroupView group={group} />

        <p className="mt-8 flex items-start gap-2 text-xs leading-relaxed text-muted">
          <Icon name="users" size={14} className="mt-px shrink-0" />
          <span>
            Anyone with this link can add and edit expenses.
          </span>
        </p>
      </div>
      {showLog && isAdmin && <AdminLog group={group} onClose={() => setShowLog(false)} />}
      {!me && !showLog && <WhoAreYou group={group} onPick={pick} onAdd={async (name) => {
        const g = await actions.addMember(name)
        const added = g.members.find((m) => m.name.toLowerCase() === name.toLowerCase())
        if (added) pick(added.id)
      }} />}
    </GroupContext.Provider>
  )
}
