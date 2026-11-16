// The unit of work: the one way to write (U1 to U6). Statements are collected from the handler and
// the services it calls, then committed as one D1 batch with the audit rows, the events and the
// jobs they cause. A guard after a statement aborts the whole batch unless that statement changed
// the expected number of rows.
import { useContext } from './context'
import { toStatement, prepare, type Statement, type Writable } from './database'
import { Refusal } from './refusal'
import { newId } from './ids'
import { nowMs } from './clock'
import { useRegistry } from './registry'
import { dispatch, type JobMessage, type Lane } from './dispatch'
import { log } from './log'
import { useSetting } from './settings-store'
import { enabledModules } from './modules-store'

export type RecordRef = { type: string, id: string } | readonly [string, string]
export const AUDIT_ACTIONS = ['create', 'update', 'delete', 'state', 'grant', 'sign-in', 'export', 'erase', 'read'] as const
export type AuditAction = typeof AUDIT_ACTIONS[number]

export interface AuditEntry {
  /** What kind of change, or the ability used (then the kind is 'state'). */
  action: AuditAction | string
  ability?: string
  record?: RecordRef
  /** Ids, codes, numbers and booleans only: never a person's name, address or words. */
  detail?: Record<string, unknown>
}

export interface Expectation { code: string, reason: string, remedy?: string }

export interface EnqueueOptions { dedupeKey?: string, delay?: number, lane?: Lane }

/** What a service is given: everything but commit. A service never commits (U3). */
export interface UnitView {
  readonly id: string
  add: (query: Writable) => UnitView
  /** The statement just added must change exactly `rows` rows, or nothing in the unit is written. */
  expect: (rows: number, refusal?: Partial<Expectation>) => UnitView
  audit: (entry: AuditEntry) => UnitView
  /** Announces an event in this unit. Returns the event's id. */
  announce: (name: string, payload: Record<string, unknown>, options?: { record?: RecordRef }) => string
  /** Queues a job, only if the unit commits. Returns the job's id. */
  enqueue: (job: string, payload: unknown, options?: EnqueueOptions) => string
  /** Runs after a successful commit. Its failure is logged and never undoes the commit. */
  afterCommit: (fn: () => unknown) => UnitView
}

export interface CommitResult {
  unitId: string
  /** D1's result for each statement added with add(), in order. */
  results: D1Result[]
  eventIds: string[]
  jobIds: string[]
}

type Item
  = | { kind: 'statement', statement: Statement }
    | { kind: 'guard', rows: number, refusal: Expectation }
    | { kind: 'audit', entry: AuditEntry }
    | { kind: 'event', id: string, name: string, payload: Record<string, unknown>, record?: RecordRef }
    | { kind: 'job', id: string, name: string, payload: unknown, options: EnqueueOptions, jobKind?: 'job' | 'listener' | 'task', module?: string }

const DEFAULT_CONFLICT: Expectation = { code: 'core.unit.conflict', reason: 'Someone else changed this at the same moment, so nothing was saved.', remedy: 'Reload and try again.' }

function ref(record?: RecordRef): { type: string | null, id: string | null } {
  if (!record) return { type: null, id: null }
  return Array.isArray(record) ? { type: record[0], id: record[1] } : { type: (record as any).type, id: (record as any).id }
}

const DETAIL_VALUE = /^[a-z0-9]+([._-][a-z0-9]+)*$/i
function checkDetail(detail: Record<string, unknown>) {
  for (const [key, value] of Object.entries(detail)) {
    const values = Array.isArray(value) ? value : [value]
    for (const v of values) {
      if (v === null || typeof v === 'number' || typeof v === 'boolean') continue
      if (typeof v === 'string' && DETAIL_VALUE.test(v) && v.length <= 80) continue // not-policy: an id or a code is short
      throw new Error(`Audit detail "${key}" must be ids, codes, numbers or booleans: never a person's name, address or words`)
    }
  }
}

export class UnitOfWork implements UnitView {
  readonly id = crypto.randomUUID()
  private items: Item[] = []
  private hooks: (() => unknown)[] = []
  private state: 'open' | 'committing' | 'committed' = 'open'
  private view_?: UnitView

  get committed(): boolean {
    return this.state === 'committed'
  }

  /** How many statements the batch will hold, before events and listeners expand. */
  get size(): number {
    return this.items.length
  }

  add(query: Writable): this {
    this.open()
    this.items.push({ kind: 'statement', statement: toStatement(query) })
    return this
  }

  expect(rows: number, refusal: Partial<Expectation> = {}): this {
    this.open()
    const last = this.items.at(-1)
    if (last?.kind !== 'statement' && last?.kind !== 'job') throw new Error('expect() follows the statement it guards')
    this.items.push({ kind: 'guard', rows, refusal: { ...DEFAULT_CONFLICT, ...refusal } })
    return this
  }

  audit(entry: AuditEntry): this {
    this.open()
    if (entry.detail) checkDetail(entry.detail)
    this.items.push({ kind: 'audit', entry })
    return this
  }

  announce(name: string, payload: Record<string, unknown>, options: { record?: RecordRef } = {}): string {
    this.open()
    const declared = useRegistry().events.get(name)
    if (!declared) throw new Error(`"${name}" is not a declared event`)
    const parsed = declared.decl.payload.safeParse(payload)
    if (!parsed.success) throw new Error(`The payload of ${name} does not match its declaration: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
    const id = newId('evt')
    this.items.push({ kind: 'event', id, name, payload: parsed.data as Record<string, unknown>, record: options.record })
    return id
  }

  enqueue(job: string, payload: unknown, options: EnqueueOptions = {}): string {
    this.open()
    const declared = useRegistry().jobs.get(job)
    if (!declared) throw new Error(`"${job}" is not a declared job`)
    const parsed = declared.decl.payload.safeParse(payload)
    if (!parsed.success) throw new Error(`The payload of ${job} does not match its declaration: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
    const id = newId('job')
    this.items.push({ kind: 'job', id, name: job, payload: parsed.data, options: { lane: declared.decl.lane, ...options }, module: declared.module })
    return id
  }

  /** The kit's own way to queue listener and task jobs, which have no declaration of their own. */
  queueInternal(kind: 'listener' | 'task', name: string, module: string, payload: unknown, options: EnqueueOptions = {}): string {
    this.open()
    const id = newId('job')
    this.items.push({ kind: 'job', id, name, payload, options: { lane: 'prompt', ...options }, jobKind: kind, module })
    return id
  }

  afterCommit(fn: () => unknown): this {
    this.open()
    this.hooks.push(fn)
    return this
  }

  /** This unit as a service sees it: no commit. Forcing a commit through it is a runtime error. */
  view(): UnitView {
    if (this.view_) return this.view_
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the view's getters read the unit
    const self = this
    const view: UnitView & { commit?: never } = {
      get id() { return self.id },
      add: q => (self.add(q), view),
      expect: (rows, refusal) => (self.expect(rows, refusal), view),
      audit: entry => (self.audit(entry), view),
      announce: (name, payload, options) => self.announce(name, payload, options),
      enqueue: (job, payload, options) => self.enqueue(job, payload, options),
      afterCommit: fn => (self.afterCommit(fn), view),
    }
    Object.defineProperty(view, 'commit', {
      enumerable: false,
      value: () => { throw new Error('A service never commits: it adds statements to its caller\'s unit of work, and the caller commits (U3)') },
    })
    return (this.view_ = view)
  }

  private open() {
    if (this.state !== 'open') throw new Error('This unit of work has already been committed')
  }

  async commit(): Promise<CommitResult> {
    this.open()
    this.state = 'committing'
    const context = useContext()
    const registry = useRegistry()
    const at = nowMs()
    const statements: Statement[] = []
    const guards = new Map<number, Expectation>()
    const added: number[] = []
    const jobs: { index: number, id: string, lane: Lane, delay?: number }[] = []
    const eventIds: string[] = []
    const needsModules = this.items.some(i => i.kind === 'event')
    const enabled = needsModules ? await enabledModules() : undefined
    const maxAttempts = await useSetting('core.jobs.attempts')

    const pushJob = (item: Extract<Item, { kind: 'job' }>) => {
      const declared = item.jobKind ? undefined : registry.jobs.get(item.name)
      const lane = item.options.lane ?? 'prompt'
      const delay = item.options.delay ?? 0
      const verb = item.options.dedupeKey ? 'INSERT OR IGNORE' : 'INSERT'
      statements.push({
        sql: `${verb} INTO core_jobs (id, kind, name, module_id, lane, payload, dedupe_key, state, attempts, max_attempts, run_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?)`,
        params: [item.id, item.jobKind ?? 'job', item.name, item.module ?? declared?.module ?? null, lane, JSON.stringify(item.payload ?? null), item.options.dedupeKey ?? null, declared?.decl.retries ?? maxAttempts, at + delay * 1000, at], // not-policy: seconds to milliseconds
      })
      jobs.push({ index: statements.length - 1, id: item.id, lane, delay })
    }

    for (const item of this.items) {
      switch (item.kind) {
        case 'statement':
          statements.push(item.statement)
          added.push(statements.length - 1)
          break
        case 'guard': {
          const index = statements.length
          guards.set(index, item.refusal)
          statements.push({ sql: 'INSERT INTO core_guard (ok, code) VALUES (CASE WHEN changes() = ? THEN 1 ELSE 0 END, ?)', params: [item.rows, String(index)] })
          break
        }
        case 'audit': {
          const { entry } = item
          const isKind = (AUDIT_ACTIONS as readonly string[]).includes(entry.action)
          const ability = entry.ability ?? (isKind ? context.ability : entry.action)
          const record = ref(entry.record)
          const module = ability?.split('.')[0] ?? record.type?.split('.')[0] ?? context.module ?? null
          statements.push({
            sql: 'INSERT INTO core_audit (id, at, actor_account_id, actor_name, actor_kind, action, ability, allowed_by, module_id, record_type, record_id, detail, request_id, unit_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            params: [newId('aud'), at, context.actor.accountId ?? null, context.actor.name ?? null, context.actor.kind === 'anonymous' ? 'person' : context.actor.kind, isKind ? entry.action : 'state', ability ?? null, context.allowedBy ?? null, module, record.type, record.id, entry.detail ? JSON.stringify(entry.detail) : null, context.requestId, this.id],
          })
          break
        }
        case 'event': {
          const record = ref(item.record)
          statements.push({
            sql: 'INSERT INTO core_events (id, name, record_type, record_id, payload, announced_at, unit_id, dispatched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            params: [item.id, item.name, record.type, record.id, JSON.stringify(item.payload), at, this.id, at],
          })
          eventIds.push(item.id)
          // Listeners become prompt-lane jobs in the same batch (E1, E3). A listener of a module
          // that is off now is not called, and is never caught up later (E5).
          for (const listener of registry.listeners.get(item.name) ?? []) {
            if (!enabled!.has(listener.module)) continue
            pushJob({ kind: 'job', id: newId('job'), name: `${listener.module}.${listener.listener}`, payload: { eventId: item.id }, options: { lane: 'prompt', dedupeKey: `${item.id}` }, jobKind: 'listener', module: listener.module })
          }
          break
        }
        case 'job':
          pushJob(item)
          break
      }
    }

    const limit = await useSetting('core.units.statement-limit') as number
    if (statements.length > limit) {
      this.state = 'open'
      throw new Refusal('core.unit.too-large', `This change needs ${statements.length} database statements, more than the limit of ${limit}, so nothing was saved.`, { status: 500 })
    }
    if (!statements.length) {
      this.state = 'committed'
      return { unitId: this.id, results: [], eventIds: [], jobIds: [] }
    }

    let results: D1Result[]
    try {
      results = await context.env.DB.batch(statements.map(s => prepare(context.env.DB, s)))
    }
    catch (error) {
      this.state = 'committed'
      const message = String((error as Error)?.message ?? error)
      const guard = /guard:(\d+)/.exec(message)
      if (guard) {
        const refusal = guards.get(Number(guard[1])) ?? DEFAULT_CONFLICT
        throw new Refusal(refusal.code, refusal.reason, { remedy: refusal.remedy, status: 409 })
      }
      throw error
    }
    this.state = 'committed'

    // A job ignored as a duplicate (same dedupe key while unfinished) gets no message.
    const queued = jobs.filter(j => (results[j.index]?.meta?.changes ?? 0) > 0)
    const messages: JobMessage[] = queued.map(j => ({ jobId: j.id, lane: j.lane, delaySeconds: j.delay || undefined }))
    await dispatch(messages)
    for (const hook of this.hooks) {
      try { await hook() }
      catch (error) { log.error('core.unit.after-commit-failed', { unitId: this.id, error: String((error as Error)?.message ?? error) }) }
    }
    return { unitId: this.id, results: added.map(i => results[i]!), eventIds, jobIds: queued.map(j => j.id) }
  }
}

/** A new unit of work. A route gets one from defineRoute; a job, listener or task from the runner. */
export function createUnit(): UnitOfWork {
  return new UnitOfWork()
}
