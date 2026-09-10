import {
  daysUntilRetentionThreshold,
  isRetentionGuest,
  isRetentionWarnable,
  retentionDigestClaimFor,
  retentionWarningClaimFor,
} from '#shared/utils/retention'
import { londonDay } from '#shared/utils/membership'
import { candidates } from './retention-candidates'
import type { CandidateRow } from './retention-candidates'
import type { RetentionWarningKind } from '#shared/utils/retention'
import type { H3Event } from 'h3'

// Inactivity warnings and anonymisation, dry-run by default (A-126, built as K-111). Reuses
// K-109's erasure engine for the write and 0011's exemptions, computed fresh every run.

// The candidate query and the digest check live in retention-candidates.ts, so a caller wanting
// only those never pulls `useRuntimeConfig` below into the Bun graph behind them (0057).

async function warn(
  event: H3Event | undefined,
  kind: RetentionWarningKind,
  row: CandidateRow,
  armed: boolean,
): Promise<boolean> {
  const key = retentionWarningClaimFor(kind, row.id, row.lastLoginAt ?? row.createdAt)
  if (!armed) return !await claimHeld(key)

  const took = await claimNotification({ userId: row.id, type: `retention.warning.${kind}`, key })
  if (!took) return false

  await notify(event, {
    type: kind === 'final' ? 'retention.warning.final' : 'retention.warning.window',
    userId: row.id,
    claim: key,
    context: { name: '', accountUrl: `${useRuntimeConfig(event).public.baseURL}/account` },
  })
  return true
}

// Refuses the surplus rather than deferring it: the next run finds the same accounts still due
// and takes the next slice, so a cap never becomes a queue (criterion 4).
async function warnWithinCap(
  event: H3Event | undefined,
  kind: RetentionWarningKind,
  row: CandidateRow,
  run: RetentionRun,
  cap: number,
): Promise<void> {
  if (run.window + run.final >= cap) {
    run.warningsCappedAt = cap
    return
  }
  if (!await warn(event, kind, row, run.armed)) return
  if (kind === 'final') run.final++
  else run.window++
}

// Sent whether armed or not: it is the thing the IT Manager reviews before arming, so dry-run
// mode must email it for real, not merely report that it would (J-105 criterion 4, criterion 3).
async function sendDigest(event: H3Event | undefined, at: Date, run: RetentionRun): Promise<void> {
  const period = londonDay(at)
  const recipients = await liveAdmins()

  for (const admin of recipients) {
    const key = retentionDigestClaimFor(admin.id, period)
    const took = await claimNotification({ userId: admin.id, type: 'retention.digest', key })
    if (!took) continue
    await notify(event, {
      type: 'retention.digest',
      userId: admin.id,
      claim: key,
      context: {
        name: '',
        armed: run.armed,
        window: run.window,
        final: run.final,
        anonymised: run.anonymised,
        wouldAnonymise: run.wouldAnonymise.length,
        warningsCappedAt: run.warningsCappedAt,
        anonymisationsCappedAt: run.anonymisationsCappedAt,
      },
    })
    run.digests++
  }
}

export interface RetentionRun {
  armed: boolean
  window: number
  final: number
  anonymised: number
  // Dry-run only: who a real arming would have anonymised this run.
  wouldAnonymise: string[]
  // Each set when more was due this run than its own cap allowed through (criterion 4).
  warningsCappedAt: number | null
  anonymisationsCappedAt: number | null
  digests: number
}

export async function sweepRetention(event: H3Event | undefined, at: Date = new Date()): Promise<RetentionRun> {
  const armed = await configValue(event, 'RETENTION_ARMED')
  const fullYears = await configValue(event, 'RETENTION_FULL_ACCOUNT_YEARS')
  const guestYears = await configValue(event, 'RETENTION_GUEST_YEARS')
  const windowDays = await configValue(event, 'RETENTION_WARNING_DAYS')
  const finalDays = await configValue(event, 'RETENTION_FINAL_WARNING_DAYS')
  const warningCap = await configValue(event, 'RETENTION_WARNING_CAP')
  const anonymiseCap = await configValue(event, 'RETENTION_SWEEP_CAP')
  const now = Math.floor(at.getTime() / 1000)

  const run: RetentionRun = {
    armed,
    window: 0,
    final: 0,
    anonymised: 0,
    wouldAnonymise: [],
    warningsCappedAt: null,
    anonymisationsCappedAt: null,
    digests: 0,
  }
  const due: CandidateRow[] = []

  for (const row of await candidates(event, now)) {
    const years = isRetentionGuest(row) ? guestYears : fullYears
    const days = daysUntilRetentionThreshold(row.lastLoginAt ?? row.createdAt, years, now)

    if (days <= 0) {
      due.push(row)
      continue
    }
    // A guest and an unproven address are anonymised on their own clock without being written
    // to, so neither may take a claim here either (criterion 1, amended 29 August 2026).
    if (!isRetentionWarnable(row)) continue

    // Independent, not either-or: a sweep that skipped a gap can find an account inside both
    // windows at once, and both fire, the same reasoning training's own sweep uses.
    if (days <= finalDays) await warnWithinCap(event, 'final', row, run, warningCap)
    if (days <= windowDays) await warnWithinCap(event, 'window', row, run, warningCap)
  }

  const capped = due.slice(0, anonymiseCap)
  if (due.length > anonymiseCap) run.anonymisationsCappedAt = anonymiseCap

  for (const row of capped) {
    if (!armed) {
      run.wouldAnonymise.push(row.id)
      continue
    }
    const outcome = await eraseAccount(row.id, null)
    if (outcome.erased) run.anonymised++
  }

  await sendDigest(event, at, run)
  return run
}
