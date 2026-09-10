import { and, asc, eq, gt, isNotNull, isNull, lte, sql } from 'drizzle-orm'
import { auditEntry } from '#shared/utils/audit'
import { chunked } from '#shared/utils/approvals'
import { londonParts } from '#shared/utils/london'
import {
  lapseNoticeCutoff,
  lapsedBefore,
  roleDigestClaimFor,
  roleExpiryClaimFor,
} from '#shared/utils/role-expiry'
import { saysRole } from '#shared/utils/roles'
import type { BatchItem } from 'drizzle-orm/batch'
import type { H3Event } from 'h3'

// A-119. Warns a holder before a grant lapses, digests the administrator monthly, and tidies the
// rows that lapsed long ago. Nothing here changes authority: expiry is read-time (0009).

// A trail row and a stamp per grant is eight bound parameters, so a batch stays inside D1's
// hundred (0006).
const GRANTS_PER_BATCH = 10

export interface RoleLapseRun {
  warned: number
  holders: number
  digests: number
  pruned: number
  // What the digest would say, counted every run though it only sends on the first: a report
  // nobody can read until the first of the month is a report nobody can test either.
  standing: { expiring: number, lapsed: number, permanent: number }
}

interface DueGrant {
  id: string
  userId: string
  role: string
  expiresAt: number
}

const londonDay = (at: Date): string => {
  const { year, month, day } = londonParts(at)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// A holder who cannot receive the warning is left out rather than claimed for: a claim spent on a
// message notify() then refuses is that account's whole notice, gone silently (A-126).
async function due(now: number, noticeDays: number): Promise<DueGrant[]> {
  const rows = await db.select({
    id: schema.roleGrants.id,
    userId: schema.roleGrants.userId,
    role: schema.roleGrants.role,
    expiresAt: schema.roleGrants.expiresAt,
  })
    .from(schema.roleGrants)
    .innerJoin(schema.users, eq(schema.users.id, schema.roleGrants.userId))
    .where(and(
      isNotNull(schema.roleGrants.expiresAt),
      gt(schema.roleGrants.expiresAt, now),
      lte(schema.roleGrants.expiresAt, lapseNoticeCutoff(now, noticeDays)),
      isNull(schema.users.anonymisedAt),
      eq(schema.users.verified, true),
    ))
    .orderBy(asc(schema.roleGrants.expiresAt), asc(schema.roleGrants.role))

  return rows.flatMap(row => row.expiresAt === null ? [] : [{ ...row, expiresAt: row.expiresAt }])
}

// One message per holder however many grants lapse together, because the committee year end
// expires every one of somebody's roles on the same day (criterion 1).
async function warnHolders(
  event: H3Event | undefined,
  at: Date,
  noticeDays: number,
  run: RoleLapseRun,
): Promise<void> {
  const now = Math.floor(at.getTime() / 1000)

  const byHolder = new Map<string, DueGrant[]>()
  for (const grant of await due(now, noticeDays)) {
    byHolder.set(grant.userId, [...(byHolder.get(grant.userId) ?? []), grant])
  }

  for (const [userId, grants] of byHolder) {
    const claimed: DueGrant[] = []
    for (const grant of grants) {
      const took = await claimNotification({
        userId,
        type: 'role.expiring',
        key: roleExpiryClaimFor(grant.id, grant.expiresAt),
      })
      if (took) claimed.push(grant)
    }
    if (claimed.length === 0) continue

    // Trailed and stamped before the send, not after: notify() records its own outcome, and a
    // warning that failed is still an automated action the trail has to show (criterion 5).
    for (const batch of chunked(claimed, GRANTS_PER_BATCH)) {
      const statements: BatchItem<'sqlite'>[] = batch.flatMap(grant => [
        db.insert(schema.auditLog).values(auditEntry({
          actorId: null,
          action: 'role.lapse-warned',
          target: `user:${userId}`,
          detail: { role: grant.role, expiresAt: grant.expiresAt },
        })),
        db.update(schema.roleGrants)
          .set({ expiryWarnedAt: now })
          .where(eq(schema.roleGrants.id, grant.id)),
      ])
      await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
    }

    await notify(event, {
      type: 'role.expiring',
      userId,
      claim: claimed.map(grant => roleExpiryClaimFor(grant.id, grant.expiresAt)),
      context: {
        name: '',
        roles: claimed.map(grant => ({
          role: saysRole(grant.role),
          lapsesOn: londonDay(new Date(grant.expiresAt * 1000)),
        })),
        accountUrl: `${useRuntimeConfig(event).public.baseURL}/account`,
      },
    })

    run.warned += claimed.length
    run.holders++
  }
}

interface DigestLine {
  name: string
  role: string
  lapsesOn: string | null
}

interface DigestLines {
  expiring: DigestLine[]
  lapsed: DigestLine[]
  permanent: DigestLine[]
}

// A lapsed grant is in the digest for exactly as long as its row survives the prune, so the
// backward window is the prune window rather than a third number nobody set (criteria 2, 4).
async function digestLines(now: number, noticeDays: number, pruneDays: number): Promise<DigestLines> {
  const rows = await db.all<{ name: string, role: string, expiresAt: number | null, state: string }>(sql`
    select u.name as name, g.role as role, g.expires_at as expiresAt,
      case
        when g.expires_at is null then 'PERMANENT'
        when g.expires_at > ${now} then 'EXPIRING'
        else 'LAPSED'
      end as state
    from role_grants g
    join users u on u.id = g.user_id
    where u.anonymised_at is null
      and (g.expires_at is null
        or (g.expires_at > ${now} and g.expires_at <= ${lapseNoticeCutoff(now, noticeDays)})
        or (g.expires_at <= ${now} and g.expires_at > ${lapsedBefore(now, pruneDays)}))
    order by g.expires_at is null, g.expires_at, u.name
  `)

  const line = (row: { name: string, role: string, expiresAt: number | null }): DigestLine => ({
    name: row.name,
    role: saysRole(row.role),
    lapsesOn: row.expiresAt === null ? null : londonDay(new Date(row.expiresAt * 1000)),
  })

  return {
    expiring: rows.filter(row => row.state === 'EXPIRING').map(line),
    lapsed: rows.filter(row => row.state === 'LAPSED').map(line),
    permanent: rows.filter(row => row.state === 'PERMANENT').map(line),
  }
}

// Live administrators whose address a message can reach, for the same reason the warning filters
// its holders: an unreachable claim is a digest nobody gets and nobody knows is missing.
async function reachableAdmins(): Promise<{ id: string }[]> {
  return db.select({ id: schema.roleGrants.userId })
    .from(schema.roleGrants)
    .innerJoin(schema.users, eq(schema.users.id, schema.roleGrants.userId))
    .where(and(
      eq(schema.roleGrants.role, 'ADMIN'),
      sql`(${schema.roleGrants.expiresAt} is null or ${schema.roleGrants.expiresAt} > unixepoch())`,
      isNull(schema.users.anonymisedAt),
      eq(schema.users.verified, true),
    ))
}

// Monthly, on the first, the cadence the training digest already keeps. It sends whether or not it
// has anything in it: a month with no digest means the clockwork stopped (criteria 2, 3).
async function sendDigests(
  event: H3Event | undefined,
  at: Date,
  lines: DigestLines,
  run: RoleLapseRun,
): Promise<void> {
  const { year, month, day } = londonParts(at)
  if (day !== 1) return

  const period = `${year}-${String(month).padStart(2, '0')}`

  for (const admin of await reachableAdmins()) {
    const key = roleDigestClaimFor(admin.id, period)
    const took = await claimNotification({ userId: admin.id, type: 'role.expiry.digest', key })
    if (!took) continue

    await notify(event, {
      type: 'role.expiry.digest',
      userId: admin.id,
      claim: key,
      context: {
        name: '',
        period,
        expiring: lines.expiring,
        lapsed: lines.lapsed,
        permanent: lines.permanent,
        rolesUrl: `${useRuntimeConfig(event).public.baseURL}/people/accounts`,
      },
    })
    run.digests++
  }
}

// Criterion 4. Housekeeping, and it changes no behaviour: the grant stopped granting anything the
// moment it expired, and the trail keeps what the row said.
async function pruneLapsed(at: Date, pruneDays: number, run: RoleLapseRun): Promise<void> {
  const cutoff = lapsedBefore(Math.floor(at.getTime() / 1000), pruneDays)

  const gone = await db.delete(schema.roleGrants)
    .where(and(isNotNull(schema.roleGrants.expiresAt), lte(schema.roleGrants.expiresAt, cutoff)))
    .returning({
      userId: schema.roleGrants.userId,
      role: schema.roleGrants.role,
      expiresAt: schema.roleGrants.expiresAt,
    })

  for (const batch of chunked(gone, GRANTS_PER_BATCH)) {
    const statements: BatchItem<'sqlite'>[] = batch.map(grant => db.insert(schema.auditLog).values(auditEntry({
      actorId: null,
      action: 'role.pruned',
      target: `user:${grant.userId}`,
      detail: { role: grant.role, expiresAt: grant.expiresAt },
    })))
    await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  }

  run.pruned = gone.length
}

export async function sweepRoleLapses(event: H3Event | undefined, at = new Date()): Promise<RoleLapseRun> {
  const noticeDays = await configValue(event, 'ROLE_LAPSE_NOTICE_DAYS')
  const pruneDays = await configValue(event, 'ROLE_GRANT_PRUNE_DAYS')
  const run: RoleLapseRun = {
    warned: 0,
    holders: 0,
    digests: 0,
    pruned: 0,
    standing: { expiring: 0, lapsed: 0, permanent: 0 },
  }

  await warnHolders(event, at, noticeDays, run)

  // Read before the prune, so a grant that lapsed inside the window is reported before its row
  // goes; the digest and the prune are two ends of the same window (criteria 2, 4).
  const lines = await digestLines(Math.floor(at.getTime() / 1000), noticeDays, pruneDays)
  run.standing = {
    expiring: lines.expiring.length,
    lapsed: lines.lapsed.length,
    permanent: lines.permanent.length,
  }

  await sendDigests(event, at, lines, run)
  await pruneLapsed(at, pruneDays, run)

  return run
}
