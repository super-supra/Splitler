import type { ReactNode } from 'react'
import { formatMoney } from '../lib/money'
import type { Group, Transfer } from '../lib/types'
import { useGroupCtx } from '../context'
import { Avatar, Button } from './ui'

/** Who `personId` pays and who pays them, from the current transfer plan, each with a Settle shortcut. */
export function Breakdown({ group, personId, transfers, onSettle }: {
  group: Group; personId: string; transfers: Transfer[]; onSettle: (t: Transfer) => void
}) {
  const { me } = useGroupCtx()
  const name = (id: string) => group.members.find((m) => m.id === id)?.name ?? '?'
  const who = (id: string) => (id === me ? 'you' : name(id))
  const money = (n: number) => formatMoney(n, group.currency)

  const rows = transfers.filter((t) => t.from === personId || t.to === personId)
  if (rows.length === 0) return <p className="px-1 py-2 text-sm text-muted">Nothing to settle.</p>

  return (
    <ul className="space-y-1">
      {rows.map((t) => {
        const pays = t.from === personId
        const other = pays ? t.to : t.from
        let text: ReactNode
        if (pays) text = <>{personId === me ? 'You pay' : 'Pays'} <b className="text-white">{who(t.to)}</b></>
        else if (t.from === me) text = <>You pay <b className="text-white">{name(personId)}</b></>
        else text = <><b className="text-white">{name(t.from)}</b> pays {personId === me ? 'you' : name(personId)}</>
        return (
          <li key={`${t.from}-${t.to}`} className="flex items-center gap-3 rounded-xl bg-surface-2/60 px-3 py-2">
            <Avatar id={other} name={name(other)} size="sm" />
            <p className="min-w-0 flex-1 break-words text-sm leading-snug text-muted">{text}</p>
            <span className={`text-sm font-semibold tabular-nums ${pays ? 'text-neg' : 'text-pos'}`}>{money(t.amount)}</span>
            <Button variant="ghost" className="!bg-surface-3 !px-3 !py-1.5 !text-xs hover:!bg-white/15" onClick={() => onSettle(t)}>Settle</Button>
          </li>
        )
      })}
    </ul>
  )
}

/** Height-animated disclosure panel (no JS measuring). */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
      <div className="overflow-hidden" inert={!open}>{children}</div>
    </div>
  )
}
