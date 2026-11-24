// Background work (J1 to J7). The core_jobs row is the truth; a queue message only says "look at
// this job". A job is claimed with a conditional update, so a message delivered twice runs it once
// (F-07). Tasks are entries in one cron trigger: each due slot is recorded once in core_task_runs,
// so cron firing twice in the minute runs the task once, and a missed slot is caught up once.
import { useContext, runInContext, SYSTEM, type KitEnv } from './context'
import { useRegistry, short } from './registry'
import { createUnit } from './unit'
import { isEnabled, enabledModules } from './modules-store'
import { useSetting } from './settings-store'
import { nowMs, localDateOf, localParts, instantOfLocal, previousDate } from './clock'
import { dispatch, setStoreJobRunner, type Lane } from './dispatch'
import { log } from './log'
import { isRefusal, Refusal } from './refusal'
import type { TaskDecl, Weekday } from './manifest'
import type { EventRow } from './handlers'
import type { JobName, JobPayload } from './registry-types'
import type { EnqueueOptions, UnitView } from './unit'

export type JobOutcome = 'done' | 'skipped' | 'waiting' | 'deferred' | 'retrying' | 'dead'

interface JobRow {
  id: string
  kind: 'job' | 'listener' | 'task'
  name: string
  module_id: string | null
  lane: Lane
  payload: string
  state: string
  attempts: number
  deferrals: number
  max_attempts: number
  run_after: number
}

/** Queues a job in a unit of its own, for code that has no unit. Inside a unit, use unit.enqueue. */
export async function enqueue<J extends JobName>(job: J, payload: JobPayload<J>, options: EnqueueOptions = {}): Promise<string> {
  const unit = createUnit()
  const id = unit.enqueue(job, payload, options)
  await unit.commit()
  return id
}

function handlerFor(row: JobRow) {
  const registry = useRegistry()
  const module = row.module_id ? registry.modules.get(row.module_id) : undefined
  if (!module) return undefined
  if (row.kind === 'listener') return module.handlers.listeners?.[short(row.name)]
  if (row.kind === 'task') return module.handlers.tasks?.[row.name]
  return module.handlers.jobs?.[row.name]
}

/** Runs one job by id, as a queue message asks. Safe to call any number of times. */
export async function runJob(jobId: string): Promise<JobOutcome> {
  const { env } = useContext()
  const row = await env.DB.prepare('SELECT * FROM core_jobs WHERE id = ?').bind(jobId).first<JobRow>()
  if (!row || row.state !== 'queued') return 'skipped'
  const at = nowMs()
  if (row.run_after > at) return 'skipped'
  // A job of a switched-off module waits, unclaimed, until the module is on again (M4).
  if (row.module_id && !(await isEnabled(row.module_id))) return 'waiting'

  const claim = await env.DB.prepare("UPDATE core_jobs SET state = 'running', attempts = attempts + 1, started_at = ? WHERE id = ? AND state = 'queued'").bind(at, jobId).run()
  // The claim's own condition (still queued) makes it at most one row; triggers could only add to the count.
  if (!(claim.meta.changes > 0)) return 'skipped'
  const attempts = row.attempts + 1
  const payload = JSON.parse(row.payload)
  if (row.kind === 'task') await env.DB.prepare('UPDATE core_task_runs SET started_at = ?, job_id = ? WHERE task = ? AND due_at = ?').bind(at, jobId, row.name, payload.dueAt).run()

  let deferred: string | undefined
  let delay = 0
  try {
    const handler = handlerFor(row) as any
    if (!handler) throw new Error(`No handler for ${row.kind} ${row.name}`)
    await runInContext({ env, actor: { kind: 'job' }, module: row.module_id ?? undefined, cache: {} }, async () => {
      const unit = createUnit()
      const view = unit.view()
      if (row.kind === 'listener') {
        const event = await env.DB.prepare('SELECT id, name, record_type, record_id, payload, announced_at FROM core_events WHERE id = ?').bind(payload.eventId).first<any>()
        if (!event) throw new Error(`Event ${payload.eventId} does not exist`)
        const shaped: EventRow = { id: event.id, name: event.name, recordType: event.record_type, recordId: event.record_id, payload: JSON.parse(event.payload), announcedAt: event.announced_at }
        await handler(shaped, view)
      }
      else if (row.kind === 'task') {
        await handler(view, { dueAt: payload.dueAt })
        unit.add({ sql: "UPDATE core_task_runs SET finished_at = ?, outcome = 'done' WHERE task = ? AND due_at = ?", params: [nowMs(), row.name, payload.dueAt] })
      }
      else {
        const defer = (reason: string) => { deferred = String(reason).slice(0, 200) } // not-policy: keeps the row small
        await handler(payload, view, { id: row.id, name: row.name, attempts, deferrals: row.deferrals ?? 0, defer })
      }
      if (deferred !== undefined) {
        // "Not yet": what the job did so far commits, the attempt is given back and it runs again later.
        const base = await useSetting('core.jobs.backoff') as number
        delay = Math.min(base * 2 ** (row.deferrals ?? 0), 43_200) // not-policy: the longest delay a queue accepts
        unit.add({ sql: "UPDATE core_jobs SET state = 'queued', attempts = attempts - 1, deferrals = deferrals + 1, run_after = ?, last_error = ? WHERE id = ? AND state = 'running'", params: [nowMs() + delay * 1000, `deferred: ${deferred}`, jobId] }) // not-policy: seconds to milliseconds
          .expect(1, { code: 'core.job.lost', reason: 'The job was reclaimed while it ran.' })
      }
      else {
        unit.add({ sql: "UPDATE core_jobs SET state = 'done', finished_at = ?, last_error = NULL WHERE id = ? AND state = 'running'", params: [nowMs(), jobId] })
          .expect(1, { code: 'core.job.lost', reason: 'The job was reclaimed while it ran.' })
      }
      await unit.commit()
    })
    if (deferred !== undefined) {
      await dispatch([{ jobId: row.id, lane: row.lane, delaySeconds: delay }])
      log.info('core.jobs.deferred', { jobId: row.id, job: row.name, deferrals: (row.deferrals ?? 0) + 1, delay, reason: deferred })
      return 'deferred'
    }
    return 'done'
  }
  catch (error) {
    // Work that needs the site's address waits until it is recorded, without spending an attempt.
    if (isRefusal(error) && error.code === 'core.site.origin-unset') return deferWhole(env, row, error.reason)
    const message = isRefusal(error) ? `${error.code}: ${error.reason}` : String((error as Error)?.message ?? error)
    return fail(env, row, attempts, message)
  }
}

setStoreJobRunner(runJob)

/** Puts a job back unrun: nothing it did is kept, the attempt is given back, and it waits longer each time. */
async function deferWhole(env: KitEnv, row: JobRow, reason: string): Promise<JobOutcome> {
  const base = await useSetting('core.jobs.backoff') as number
  const delay = Math.min(base * 2 ** (row.deferrals ?? 0), 43_200) // not-policy: the longest delay a queue accepts
  await env.DB.prepare("UPDATE core_jobs SET state = 'queued', attempts = attempts - 1, deferrals = deferrals + 1, run_after = ?, last_error = ? WHERE id = ? AND state = 'running'").bind(nowMs() + delay * 1000, `deferred: ${reason.slice(0, 200)}`, row.id).run() // not-policy: seconds to milliseconds; keeps the row small
  await dispatch([{ jobId: row.id, lane: row.lane, delaySeconds: delay }])
  log.info('core.jobs.deferred', { jobId: row.id, job: row.name, deferrals: (row.deferrals ?? 0) + 1, delay, reason })
  return 'deferred'
}

async function fail(env: KitEnv, row: JobRow, attempts: number, message: string): Promise<JobOutcome> {
  const at = nowMs()
  const error = message.slice(0, 1000) // not-policy: keeps the row small
  if (attempts >= row.max_attempts) {
    const unit = createUnit()
    unit.add({ sql: "UPDATE core_jobs SET state = 'dead', last_error = ?, finished_at = ? WHERE id = ? AND state = 'running'", params: [error, at, row.id] }).expect(1)
    if (row.kind === 'task') unit.add({ sql: "UPDATE core_task_runs SET finished_at = ?, outcome = 'failed' WHERE job_id = ?", params: [at, row.id] })
    unit.announce('core.job.died', { jobId: row.id, name: row.name })
    try { await unit.commit() }
    catch (e) { log.error('core.jobs.dead-not-recorded', { jobId: row.id, error: String(e) }) }
    log.error('core.jobs.died', { jobId: row.id, job: row.name, attempts, error })
    return 'dead'
  }
  const base = await useSetting('core.jobs.backoff') as number
  const delay = Math.min(base * 2 ** (attempts - 1), 43_200) // not-policy: the longest delay a queue accepts
  await env.DB.prepare("UPDATE core_jobs SET state = 'queued', run_after = ?, last_error = ? WHERE id = ? AND state = 'running'").bind(at + delay * 1000, error, row.id).run() // not-policy: seconds to milliseconds
  await dispatch([{ jobId: row.id, lane: row.lane, delaySeconds: delay }])
  log.warn('core.jobs.retrying', { jobId: row.id, job: row.name, attempts, delay, error })
  return 'retrying'
}

/**
 * Cancels a job that has not started, in the caller's unit of work. Only a queued job can be
 * cancelled: a running one finishes or fails, and a scheduled task is due again at its next slot.
 * The route guards it with core.job.manage.
 */
export async function cancelJob(unit: UnitView, jobId: string): Promise<void> {
  const { env } = useContext()
  const row = await env.DB.prepare('SELECT kind, state FROM core_jobs WHERE id = ?').bind(jobId).first<{ kind: JobRow['kind'], state: string }>()
  if (!row) throw new Refusal('core.job.unknown', 'There is no such job.', { status: 404 })
  if (row.kind === 'task') throw new Refusal('core.job.not-cancellable', 'A scheduled task cannot be cancelled. It runs again at its next time.', { status: 409 })
  unit.add({ sql: "UPDATE core_jobs SET state = 'cancelled', finished_at = ? WHERE id = ? AND state = 'queued'", params: [nowMs(), jobId] })
    .expect(1, { code: 'core.job.not-cancellable', reason: 'Only a job that is waiting to run can be cancelled.' })
}

const DAYS: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MINUTE = 60_000 // not-policy: unit of time

/** The most recent instant at or before `at` when the task was due. */
export function latestSlot(decl: TaskDecl, at: number, timeZone: string): number {
  if (decl.every) {
    const n = Number(decl.every.slice(0, -1))
    const period = n * (decl.every.endsWith('h') ? 60 : 1) * MINUTE // not-policy: minutes in an hour
    return Math.floor(at / period) * period
  }
  const time = decl.dailyAt ?? decl.weeklyOn!.at
  let date = localDateOf(at, timeZone)
  for (let back = 0; back <= 8; back++) { // not-policy: a week and a day covers every weekly slot
    const candidate = instantOfLocal(date, time, timeZone)
    const dayMatches = !decl.weeklyOn || DAYS[localParts(candidate, timeZone).weekday] === decl.weeklyOn.day
    if (candidate <= at && dayMatches) return candidate
    date = previousDate(date)
  }
  throw new Error('No slot found')
}

/**
 * Records each task's due slot once and queues it (J5, J6). Runs every minute from the cron
 * trigger; running it twice in a minute queues nothing new.
 */
export async function runScheduler(at = nowMs()): Promise<string[]> {
  const registry = useRegistry()
  const { env } = useContext()
  // Until setup sets the theatre's zone, scheduled tasks keep UTC.
  const timeZone = (await useSetting('core.locale.time-zone') as string | null) ?? 'UTC'
  const timeout = await useSetting('core.jobs.timeout') as number
  const on = await enabledModules()
  const queued: string[] = []
  for (const [name, { module, decl }] of registry.tasks) {
    if (!on.has(module)) continue
    const dueAt = latestSlot(decl, at, timeZone)
    // A run still going is not started again.
    const running = await env.DB.prepare('SELECT due_at FROM core_task_runs WHERE task = ? AND finished_at IS NULL AND due_at < ? AND due_at > ? LIMIT 1').bind(name, dueAt, at - timeout * 1000).first() // not-policy: seconds to milliseconds
    if (running) continue
    const unit = createUnit()
    unit.add({ sql: 'INSERT OR IGNORE INTO core_task_runs (task, due_at) VALUES (?, ?)', params: [name, dueAt] })
      .expect(1, { code: 'core.task.already-queued', reason: 'This slot is already queued.' })
    unit.queueInternal('task', name, module, { dueAt })
    try {
      await unit.commit()
      queued.push(name)
    }
    catch (error) {
      if (!(isRefusal(error) && error.code === 'core.task.already-queued')) throw error
    }
  }
  return queued
}

/**
 * Recovers what a lost message or a crashed run left behind: a job running for longer than the
 * timeout goes back to the queue, and a queued job overdue by more than a minute is sent again.
 */
export async function sweepJobs(at = nowMs()): Promise<{ reset: number, resent: number }> {
  const { env } = useContext()
  const timeout = await useSetting('core.jobs.timeout') as number
  const reset = await env.DB.prepare("UPDATE core_jobs SET state = 'queued', run_after = ?, last_error = 'Stopped without finishing; queued again' WHERE state = 'running' AND started_at < ?").bind(at, at - timeout * 1000).run() // not-policy: seconds to milliseconds
  const overdue = await env.DB.prepare("SELECT id, lane, module_id FROM core_jobs WHERE state = 'queued' AND run_after <= ? ORDER BY run_after LIMIT 100").bind(at - MINUTE).all<{ id: string, lane: Lane, module_id: string | null }>() // not-policy: a batch per minute
  const on = await enabledModules()
  const messages = overdue.results.filter(j => !j.module_id || on.has(j.module_id)).map(j => ({ jobId: j.id, lane: j.lane }))
  await dispatch(messages)
  return { reset: reset.meta.changes ?? 0, resent: messages.length }
}

/** One minute of the cron trigger: tasks, the job sweep, external-call reconciliation and moving old Worker secrets into the app. */
export async function tick(env: KitEnv, at = nowMs()): Promise<void> {
  await runInContext({ env, actor: SYSTEM, cache: {} }, async () => {
    const { ensureMigrated } = await import('./migrations')
    await ensureMigrated()
    for (const [step, fn] of [['scheduler', () => runScheduler(at)], ['sweep', () => sweepJobs(at)], ['reconcile', async () => (await import('./external')).reconcileDue(at)], ['credentials', async () => (await import('./secrets')).adoptWorkerSecrets()], ['content', async () => (await import('./content-upkeep')).runContentUpkeep(at)]] as const) {
      try { await fn() }
      catch (error) { log.error(`core.tick.${step}-failed`, { error: String((error as Error)?.message ?? error) }) }
    }
  })
}
