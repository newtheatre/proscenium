import { and, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import { londonParts } from '#shared/utils/london'
import { claimFor, digestClaimFor, nagClaimFor, nagWeek } from '#shared/utils/training-expiry'
import type { WarningKind } from '#shared/utils/training-expiry'
import type { H3Event } from 'h3'

// The clockwork half of G-125. It reads records and writes only the notification ledger: expiry
// happens because the calendar moved, and the sweep merely notices (criterion 5).

export interface SweepRun {
  armed: boolean
  window: number
  final: number
  digests: number
  pruned: number
  nags: number
  // What a disarmed run would have sent, so the report is the same shape either way.
  wouldSend: { userId: string, kind: WarningKind, moduleIds: string[] }[]
}

interface DueRow {
  recordId: string
  userId: string
  moduleId: string
  moduleName: string
  department: string
  expiresOn: string
}

// Records whose expiry falls inside `days` and has not yet passed, briefs excluded: a brief never
// expires and warning about one would be inventing an obligation (G-125, records-and-expiry).
async function dueWithin(today: string, days: number): Promise<DueRow[]> {
  return db.all<DueRow>(sql`
    select r.id as recordId, r.user_id as userId, r.module_id as moduleId,
      m.name as moduleName, m.department as department, r.expires_on as expiresOn
    from training_records r
    join modules m on m.id = r.module_id
    where r.revoked_at is null
      and r.expires_on is not null
      and m.kind != 'BRIEF'
      and r.expires_on > ${today}
      and r.expires_on <= date(${today}, ${`+${days} days`})
      and not exists (
        select 1 from training_records newer
        where newer.user_id = r.user_id and newer.module_id = r.module_id
          and newer.revoked_at is null
          and (newer.awarded_on > r.awarded_on
            or (newer.awarded_on = r.awarded_on and newer.rowid > r.rowid)))
    order by r.expires_on, r.user_id
  `)
}

const londonDay = (at: Date): string => {
  const { year, month, day } = londonParts(at)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export async function sweepExpiries(event: H3Event | undefined, at = new Date()): Promise<SweepRun> {
  const armed = await configValue(event, 'TRAINING_SWEEP_ARMED')
  const windowDays = await configValue(event, 'TRAINING_EXPIRY_WARNING_DAYS')
  const finalDays = await configValue(event, 'TRAINING_FINAL_WARNING_DAYS')
  const today = londonDay(at)

  const run: SweepRun = { armed, window: 0, final: 0, digests: 0, pruned: 0, nags: 0, wouldSend: [] }

  // The final warning is the tighter window, so it is swept first: a record inside both is
  // urgent, and the two warnings are independent rather than one superseding the other.
  for (const kind of ['final', 'window'] as const) {
    const days = kind === 'final' ? finalDays : windowDays
    const due = await dueWithin(today, days)

    const byMember = new Map<string, DueRow[]>()
    for (const row of due) byMember.set(row.userId, [...(byMember.get(row.userId) ?? []), row])

    for (const [userId, rows] of byMember) {
      const claimed: DueRow[] = []
      for (const row of rows) {
        if (!armed) {
          // A disarmed run reports without claiming, so arming it later still warns everybody.
          if (!await claimHeld(claimFor(kind, row.recordId))) claimed.push(row)
          continue
        }
        const took = await claimNotification({
          userId,
          type: `training.expiry.${kind}`,
          key: claimFor(kind, row.recordId),
          recordId: row.recordId,
        })
        if (took) claimed.push(row)
      }
      if (claimed.length === 0) continue

      if (!armed) {
        run.wouldSend.push({ userId, kind, moduleIds: claimed.map(row => row.moduleId) })
      }
      else {
        await notify(event, {
          type: kind === 'final' ? 'training.expiry.final' : 'training.expiry.window',
          userId,
          // One message covers every row claimed above; all of their claim rows move together.
          claim: claimed.map(row => claimFor(kind, row.recordId)),
          context: {
            name: '',
            modules: claimed.map(row => ({
              id: row.moduleId,
              name: row.moduleName,
              expiresOn: row.expiresOn,
            })),
            trainingUrl: `${useRuntimeConfig(event).public.baseURL}/training`,
          },
        })
      }
      run[kind] += claimed.length
    }
  }

  run.digests = await sendDigests(event, at, armed)
  run.pruned = await pruneLedger(event, at)
  run.nags = await nagUnmarkedRegisters(event, today, armed)
  return run
}

// Criterion 3. A digest goes out whether or not it has anything in it, because a month with no
// digest means the clockwork stopped rather than that nothing expired.
async function sendDigests(event: H3Event | undefined, at: Date, armed: boolean): Promise<number> {
  const { year, month, day } = londonParts(at)
  if (day !== 1) return 0

  const period = `${year}-${String(month).padStart(2, '0')}`
  const today = londonDay(at)
  const recipients = await digestRecipients()
  let sent = 0

  for (const person of recipients) {
    const key = digestClaimFor(person.userId, period)
    if (!armed) {
      if (!await claimHeld(key)) sent++
      continue
    }
    const took = await claimNotification({
      userId: person.userId,
      type: 'training.expiry.digest',
      key,
    })
    if (!took) continue

    const lines = await digestFor(person.userId, person.everything, today)
    await notify(event, {
      type: 'training.expiry.digest',
      userId: person.userId,
      claim: key,
      context: {
        name: '',
        period,
        expiring: lines.filter(line => line.state === 'EXPIRING'),
        expired: lines.filter(line => line.state === 'EXPIRED'),
        trainingUrl: `${useRuntimeConfig(event).public.baseURL}/training/manage/records`,
      },
    })
    sent++
  }
  return sent
}

export interface DigestRecipient {
  userId: string
  // True for an administrator or the training officer, who read the whole estate rather than
  // the departments they happen to lead.
  everything: boolean
}

async function digestRecipients(): Promise<DigestRecipient[]> {
  const live = or(isNull(schema.roleGrants.expiresAt), sql`${schema.roleGrants.expiresAt} > unixepoch()`)
  const everything = await db.select({ userId: schema.roleGrants.userId })
    .from(schema.roleGrants)
    .where(and(inArray(schema.roleGrants.role, ['ADMIN', 'TRAINING_MANAGER']), live))

  const leads = await db.select({ userId: schema.departmentLeads.userId })
    .from(schema.departmentLeads)
    .where(or(
      isNull(schema.departmentLeads.expiresAt),
      sql`${schema.departmentLeads.expiresAt} > unixepoch()`,
    ))

  // An officer who also leads a department reads everything, not just their own: the wider scope
  // wins rather than the two being added together (criterion 2).
  const sees = new Set(everything.map(row => row.userId))
  const recipients = [...sees].map(userId => ({ userId, everything: true }))
  for (const row of leads) {
    if (!sees.has(row.userId)) {
      sees.add(row.userId)
      recipients.push({ userId: row.userId, everything: false })
    }
  }
  return recipients
}

interface DigestLine {
  name: string
  moduleId: string
  moduleName: string
  expiresOn: string
  state: 'EXPIRING' | 'EXPIRED'
}

async function digestFor(userId: string, everything: boolean, today: string): Promise<DigestLine[]> {
  // Scoped by subquery rather than by a list of departments read back first, so the statement
  // binds the same handful of parameters however many departments somebody leads (0003).
  const scope = everything
    ? sql`1 = 1`
    : sql`m.department in (
        select department from department_leads
        where user_id = ${userId} and (expires_at is null or expires_at > unixepoch()))`

  return db.all<DigestLine>(sql`
    select u.name as name, r.module_id as moduleId, m.name as moduleName,
      r.expires_on as expiresOn,
      case when r.expires_on <= ${today} then 'EXPIRED' else 'EXPIRING' end as state
    from training_records r
    join modules m on m.id = r.module_id
    join users u on u.id = r.user_id
    where r.revoked_at is null
      and r.expires_on is not null
      and m.kind != 'BRIEF'
      and r.expires_on <= date(${today}, '+60 days')
      and ${scope}
      and not exists (
        select 1 from training_records newer
        where newer.user_id = r.user_id and newer.module_id = r.module_id
          and newer.revoked_at is null
          and (newer.awarded_on > r.awarded_on
            or (newer.awarded_on = r.awarded_on and newer.rowid > r.rowid)))
    order by r.expires_on, u.name
  `)
}

// Criterion 6. Pruned in every mode, because a ledger that only grows is its own outage.
async function pruneLedger(event: H3Event | undefined, at: Date): Promise<number> {
  const months = await configValue(event, 'TRAINING_LEDGER_MONTHS')
  const cutoff = await db.all<{ at: number }>(
    sql`select unixepoch(datetime(${Math.floor(at.getTime() / 1000)}, 'unixepoch', ${`-${months} months`})) as at`,
  )

  const gone = await db.delete(schema.notificationLog)
    .where(and(
      lt(schema.notificationLog.createdAt, cutoff[0]!.at),
      isNotNull(schema.notificationLog.sentAt),
    ))
    .returning({ id: schema.notificationLog.id })
  return gone.length
}

// G-119. A register opened and never marked means a taught session awarded nothing, so the trainer
// is chased weekly. The sweep only notices: nothing on any schedule ever marks or awards.
async function nagUnmarkedRegisters(
  event: H3Event | undefined,
  today: string,
  armed: boolean,
): Promise<number> {
  const stale = await db.all<{
    id: string
    heldOn: string
    trainerId: string
    trainerName: string
  }>(sql`
    select s.id as id, s.held_on as heldOn, s.trainer_id as trainerId, u.name as trainerName
    from training_sessions s
    join users u on u.id = s.trainer_id
    where s.register_opened_at is not null
      and s.marked_at is null
      and s.status != 'CANCELLED'
      and s.held_on < ${today}
    order by s.held_on
  `)

  let sent = 0
  for (const row of stale) {
    const week = nagWeek(row.heldOn, today)
    if (week === null) continue

    const key = nagClaimFor(row.id, week)
    if (!armed) {
      if (!await claimHeld(key)) sent++
      continue
    }
    const took = await claimNotification({
      userId: row.trainerId,
      type: 'training.register.unmarked',
      key,
      sessionId: row.id,
    })
    if (!took) continue

    await notify(event, {
      type: 'training.register.unmarked',
      userId: row.trainerId,
      claim: key,
      context: {
        name: '',
        heldOn: row.heldOn,
        registerUrl: `${useRuntimeConfig(event).public.baseURL}/training/sessions/${row.id}/register`,
      },
    })
    sent++
  }
  return sent
}

// Criterion 2. Nags stop at sixty days; the register stays stale to leads and administrators
// indefinitely, because an unmarked register is a session that awarded nothing.
export async function staleRegisters(today: string): Promise<{
  id: string
  heldOn: string
  trainerName: string
  daysStale: number
}[]> {
  return db.all(sql`
    select s.id as id, s.held_on as heldOn, u.name as trainerName,
      cast(julianday(${today}) - julianday(s.held_on) as integer) as daysStale
    from training_sessions s
    join users u on u.id = s.trainer_id
    where s.register_opened_at is not null
      and s.marked_at is null
      and s.status != 'CANCELLED'
      and s.held_on < ${today}
    order by s.held_on
  `)
}
