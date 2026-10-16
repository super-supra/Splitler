import { useEffect, useState } from 'react'
import { GroupView } from '../components/GroupView'
import { WhoAreYou } from '../components/WhoAreYou'
import { GroupContext } from '../context'
import { useGroupSync } from '../hooks/useGroupSync'
import { api, formatExpiry } from '../lib/api'
import { navigate } from '../lib/route'

const meKey = (id: string) => `splitler-me-${id}`

function readMe(id: string): string | null {
  try { return localStorage.getItem(meKey(id)) } catch { return null }
}

export function GroupPage({ id }: { id: string }) {
  const [meId, setMeId] = useState<string | null>(() => readMe(id))
  const [isAdmin, setIsAdmin] = useState(false)
  // actor name is resolved lazily so mutations always label the current identity
  const [nameRef] = useState({ current: undefined as string | undefined })
  const { group, expiresIn, status, actions } = useGroupSync(id, () => nameRef.current)

  useEffect(() => { api.me().then((r) => setIsAdmin(r.admin)).catch(() => {}) }, [])

  const me = group?.members.find((m) => m.id === meId) ?? null
  nameRef.current = me?.name

  function pick(memberId: string) {
    setMeId(memberId)
    try { localStorage.setItem(meKey(id), memberId) } catch { /* private mode */ }
  }

  if (status === 'loading') return <p className="p-8 text-center text-slate-500">Loading…</p>
  if (status === 'notfound' || !group) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="mb-2 text-xl font-semibold">This group has expired or doesn’t exist</h1>
        <p className="text-sm text-slate-500">Groups are deleted after 7 days without activity. Ask for a new link.</p>
        {status === 'error' && <p className="mt-2 text-sm text-red-600">Couldn’t reach the server.</p>}
      </div>
    )
  }

  return (
    <GroupContext.Provider value={{ actions, me: me?.id ?? null }}>
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {me ? <>You are <b>{me.name}</b> · <button className="underline" onClick={() => setMeId(null)}>not you?</button></> : null}
          </span>
          {isAdmin && <button className="text-emerald-600" onClick={() => navigate('/')}>← Admin home</button>}
        </div>
        <div className="rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-900">
          Anyone with this link can add and edit expenses. The group is deleted after 7 days of no activity
          {expiresIn > 0 && <> (expires in {formatExpiry(expiresIn)} unless someone adds something)</>}.
        </div>
        <GroupView group={group} />
      </div>
      {!me && <WhoAreYou group={group} onPick={pick} onAdd={async (name) => {
        const g = await actions.addMember(name)
        const added = g.members.find((m) => m.name.toLowerCase() === name.toLowerCase())
        if (added) pick(added.id)
      }} />}
    </GroupContext.Provider>
  )
}
