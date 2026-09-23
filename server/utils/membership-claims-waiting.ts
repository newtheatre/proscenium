import { db } from '@nuxthub/db'
import { formatLondon } from '#shared/utils/london'
import { londonDay } from '#shared/utils/membership'
import { claimsDecidersStatement, claimsWaitingClaimFor, waitingClaimsStatement } from '#shared/utils/membership-claims'
import { claimNotification, notify } from './notify'
import type { H3Event } from 'h3'

export interface WaitingClaimsRun { waiting: number, sent: number }

// Daily, from daily:sweeps: while any claim waits, each officer who can decide one is told once
// that London day, so discovery never rests on somebody remembering (A-130 criterion 11).
export async function remindWaitingClaims(event: H3Event | undefined, at = new Date()): Promise<WaitingClaimsRun> {
  const [summary] = await db.all<{ waiting: number, oldest: number | null }>(waitingClaimsStatement())
  const waiting = Number(summary?.waiting ?? 0)
  if (waiting === 0 || summary?.oldest === null || summary?.oldest === undefined) return { waiting: 0, sent: 0 }

  const day = londonDay(at)
  const since = formatLondon(new Date(summary.oldest * 1000), { dateStyle: 'full', timeStyle: 'short' })
  const queueUrl = `${useRuntimeConfig(event).public.baseURL}/people/members?filter=awaiting-record`

  let sent = 0
  for (const officer of await db.all<{ id: string }>(claimsDecidersStatement(Math.floor(at.getTime() / 1000)))) {
    const key = claimsWaitingClaimFor(officer.id, day)
    if (!await claimNotification({ userId: officer.id, type: 'membership.claims.waiting', key })) continue
    await notify(event, {
      type: 'membership.claims.waiting',
      userId: officer.id,
      claim: key,
      context: { name: '', count: waiting, since, queueUrl },
    })
    sent++
  }
  return { waiting, sent }
}
