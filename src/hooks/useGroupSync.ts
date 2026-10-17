import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GroupActions } from '../context'
import { api, ApiError, type GroupPayload } from '../lib/api'
import type { Group } from '../lib/types'

const POLL_MS = 6000

type Status = 'loading' | 'ok' | 'notfound' | 'error'

/** Loads a shared group, keeps it fresh by polling, and exposes mutations that return the new state. */
export function useGroupSync(id: string, getActor: () => string | undefined) {
  const [payload, setPayload] = useState<GroupPayload | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const ver = useRef<string | undefined>(undefined)
  const actorRef = useRef(getActor)
  actorRef.current = getActor

  const apply = useCallback((p: GroupPayload) => {
    ver.current = p.ver
    setPayload(p)
    setStatus('ok')
    return p.group
  }, [])

  const refresh = useCallback(async () => {
    try {
      const r = await api.getGroup(id, ver.current)
      if (!('unchanged' in r)) apply(r)
      else setStatus((s) => (s === 'loading' ? 'ok' : s))
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setStatus('notfound')
      else setStatus((s) => (s === 'loading' ? 'error' : s)) // keep showing stale data on transient errors
    }
  }, [id, apply])

  useEffect(() => {
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      if (!stop && document.visibilityState === 'visible') await refresh()
      if (!stop) timer = setTimeout(tick, POLL_MS)
    }
    void refresh().then(() => { if (!stop) timer = setTimeout(tick, POLL_MS) })
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stop = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const actions = useMemo<GroupActions>(() => {
    const actor = () => actorRef.current()
    return {
      saveExpense: async (input, existingId) =>
        apply(existingId ? await api.updateExpense(id, existingId, input, actor())
                         : await api.createExpense(id, input, actor())),
      deleteExpense: async (eid) => apply(await api.deleteExpense(id, eid, actor())),
      addSettlement: async (input) => apply(await api.createSettlement(id, input, actor())),
      deleteSettlement: async (sid) => apply(await api.deleteSettlement(id, sid, actor())),
      addMember: async (name) => apply(await api.addMember(id, name, actor())),
      restore: async (entryId) => apply(await api.restore(id, entryId)),
    }
  }, [id, apply])

  return {
    group: payload?.group as Group | undefined,
    status,
    actions,
  }
}
