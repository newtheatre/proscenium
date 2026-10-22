import { db } from '@nuxthub/db'
import { declarationsVerifiersStatement, declarationsWaitingClaimFor, waitingDeclarationsStatement } from '#shared/utils/access-profiles-waiting'
import { formatLondon } from '#shared/utils/london'
import { londonDay } from '#shared/utils/membership'
import { claimNotification, notify } from './notify'
import type { H3Event } from 'h3'

export interface WaitingDeclarationsRun { waiting: number, sent: number }

// Daily, from daily:sweeps: while any declaration waits, each officer who can verify one is told
// once that London day, the membership claims notice's shape (0156).
export async function remindWaitingDeclarations(event: H3Event | undefined, at = new Date()): Promise<WaitingDeclarationsRun> {
  const [summary] = await db.all<{ waiting: number, oldest: number | null }>(waitingDeclarationsStatement())
  const waiting = Number(summary?.waiting ?? 0)
  if (waiting === 0 || summary?.oldest === null || summary?.oldest === undefined) return { waiting: 0, sent: 0 }

  const day = londonDay(at)
  const since = formatLondon(new Date(summary.oldest * 1000), { dateStyle: 'full', timeStyle: 'short' })
  const queueUrl = `${useRuntimeConfig(event).public.baseURL}/people/access`

  let sent = 0
  for (const officer of await db.all<{ id: string }>(declarationsVerifiersStatement(Math.floor(at.getTime() / 1000)))) {
    const key = declarationsWaitingClaimFor(officer.id, day)
    if (!await claimNotification({ userId: officer.id, type: 'access-profiles.waiting', key })) continue
    await notify(event, {
      type: 'access-profiles.waiting',
      userId: officer.id,
      claim: key,
      context: { name: '', count: waiting, since, queueUrl },
    })
    sent++
  }
  return { waiting, sent }
}
