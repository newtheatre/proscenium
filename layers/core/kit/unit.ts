// The unit of work: the one way to write (U1 to U9). Statements are collected from the handler and
// the services it calls, then committed as one D1 batch with the audit rows, the events and the
// jobs they cause. A guard after a statement aborts the whole batch unless that statement changed
// the expected number of rows. A fan-out is written set-wise (U7, U8): every row of a set travels
// in one JSON parameter and each table is written by one INSERT ... SELECT over json_each, so the
// statement count does not grow with the rows.
import { getTableColumns } from 'drizzle-orm'
import { useContext } from './context'
import { toStatement, prepare, bindable, type Statement, type Writable } from './database'
import { tableMeta } from './db'
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

/** One event of a set given to announce(). */
export interface Announcement { payload: Record<string, unknown>, record?: RecordRef }

/** What a service is given: everything but commit. A service never commits (U3). */
export interface UnitView {
  readonly id: string
  add: (query: Writable) => UnitView
  /** The statement just added must change exactly `rows` rows, or nothing in the unit is written. */
  expect: (rows: number, refusal?: Partial<Expectation>) => UnitView
  /** One audit row, or a set of them written as one statement (U8). */
  audit: (entry: AuditEntry | readonly AuditEntry[]) => UnitView
  /**
   * Announces an event in this unit and returns its id. Given a set, announces each as its own
   * event in one statement (plus one per listener) and returns their ids in order (U8).
   */
  announce: {
    (name: string, payload: Record<string, unknown>, options?: { record?: RecordRef }): string
    (name: string, set: readonly Announcement[]): string[]
  }
  /**
   * Inserts every row in one statement (U7) and returns the rows' ids in order (empty for a table
   * with no id column). Ids and other defaults are made here, before the unit is built. Every row
   * gives the same columns. A guard may follow it, as after add().
   */
  insertSet: (table: unknown, rows: readonly Record<string, unknown>[]) => string[]
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
  = | { kind: 'statement', statement: Statement, rows?: number }
    | { kind: 'guard', rows: number, refusal: Expectation }
    | { kind: 'audit', entries: AuditEntry[], set: boolean }
    | { kind: 'event', name: string, events: { id: string, payload: Record<string, unknown>, record?: RecordRef }[], set: boolean }
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

/** Reads element `i` of each json_each row. */
const at_ = (i: number) => `json_extract(value, '$[${i}]')`

/** A JSON array of rows for json_each, each value already as D1 would bind it. */
function setParam(rows: unknown[][]): string {
  return JSON.stringify(rows.map(row => bindable(row)))
}

/** The INSERT ... SELECT that writes a set: one bound JSON parameter whatever the row count. */
export function insertSetStatement(table: unknown, rows: readonly Record<string, unknown>[]): { statement: Statement, ids: string[] } {
  const meta = tableMeta(table)
  if (!meta) throw new Error('insertSet() takes a table declared with defineTable')
  const columns = getTableColumns(table as any) as Record<string, any>
  const given = new Set<string>()
  for (const row of rows) for (const key of Object.keys(row)) given.add(key)
  for (const key of given) if (!columns[key]) throw new Error(`${meta.name} has no column "${key}"`)
  const keys = Object.keys(columns).filter(key => given.has(key) || columns[key].defaultFn)
  const idKey = Object.entries(meta.columns).find(([, c]) => c.meta.helper === 'id')?.[0]
  const ids: string[] = []
  const values = rows.map((row, n) => keys.map((key) => {
    const column = columns[key]
    let value = row[key]
    if (value === undefined) {
      if (!column.defaultFn) throw new Error(`Every row in a set gives the same columns: row ${n} of ${meta.name} has no "${key}"`)
      value = column.defaultFn()
    }
    if (key === idKey) ids.push(value as string)
    if (value === null) return null
    const driver = column.mapToDriverValue(value)
    if (driver instanceof ArrayBuffer || ArrayBuffer.isView(driver)) throw new Error(`insertSet() cannot carry binary values (${meta.name}.${key})`)
    return driver
  }))
  const names = keys.map(key => `"${columns[key].name}"`).join(', ')
  const select = keys.map((_, i) => at_(i)).join(', ')
  return { statement: { sql: `INSERT INTO "${meta.name}" (${names}) SELECT ${select} FROM json_each(?)`, params: [setParam(values)] }, ids }
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

  audit(entry: AuditEntry | readonly AuditEntry[]): this {
    this.open()
    const set = Array.isArray(entry)
    const entries = (set ? [...entry] : [entry]) as AuditEntry[]
    for (const e of entries) if (e.detail) checkDetail(e.detail)
    if (entries.length) this.items.push({ kind: 'audit', entries, set })
    return this
  }

  announce(name: string, payload: Record<string, unknown>, options?: { record?: RecordRef }): string
  announce(name: string, set: readonly Announcement[]): string[]
  announce(name: string, payloadOrSet: Record<string, unknown> | readonly Announcement[], options: { record?: RecordRef } = {}): string | string[] {
    this.open()
    const declared = useRegistry().events.get(name)
    if (!declared) throw new Error(`"${name}" is not a declared event`)
    const set = Array.isArray(payloadOrSet)
    const given = set ? payloadOrSet as readonly Announcement[] : [{ payload: payloadOrSet as Record<string, unknown>, record: options.record }]
    const events = given.map(({ payload, record }) => {
      const parsed = declared.decl.payload.safeParse(payload)
      if (!parsed.success) throw new Error(`The payload of ${name} does not match its declaration: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
      return { id: newId('evt'), payload: parsed.data as Record<string, unknown>, record }
    })
    if (events.length) this.items.push({ kind: 'event', name, events, set })
    return set ? events.map(e => e.id) : events[0]!.id
  }

  insertSet(table: unknown, rows: readonly Record<string, unknown>[]): string[] {
    this.open()
    if (!rows.length) return []
    const { statement, ids } = insertSetStatement(table, rows)
    this.items.push({ kind: 'statement', statement, rows: rows.length })
    return ids
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
      announce: ((name: string, payload: any, options?: { record?: RecordRef }) => self.announce(name, payload, options)) as UnitView['announce'],
      insertSet: (table, rows) => self.insertSet(table, rows),
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
    const sets: number[] = []
    const jobSets: { id: string, lane: Lane }[] = []
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
          if (item.rows) sets.push(item.rows)
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
          const rows = item.entries.map((entry) => {
            const isKind = (AUDIT_ACTIONS as readonly string[]).includes(entry.action)
            const ability = entry.ability ?? (isKind ? context.ability : entry.action)
            const record = ref(entry.record)
            const module = ability?.split('.')[0] ?? record.type?.split('.')[0] ?? context.module ?? null
            return [newId('aud'), isKind ? entry.action : 'state', ability ?? null, module, record.type, record.id, entry.detail ? JSON.stringify(entry.detail) : null]
          })
          const actor = [context.actor.accountId ?? null, context.actor.name ?? null, context.actor.kind === 'anonymous' ? 'person' : context.actor.kind]
          if (!item.set) {
            const [id, action, ability, module, type, recordId, detail] = rows[0]!
            statements.push({
              sql: 'INSERT INTO core_audit (id, at, actor_account_id, actor_name, actor_kind, action, ability, allowed_by, module_id, record_type, record_id, detail, request_id, unit_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              params: [id, at, ...actor, action, ability, context.allowedBy ?? null, module, type, recordId, detail, context.requestId, this.id],
            })
          }
          else {
            sets.push(rows.length)
            statements.push({
              sql: `INSERT INTO core_audit (id, at, actor_account_id, actor_name, actor_kind, action, ability, allowed_by, module_id, record_type, record_id, detail, request_id, unit_id) SELECT ${at_(0)}, ?, ?, ?, ?, ${at_(1)}, ${at_(2)}, ?, ${at_(3)}, ${at_(4)}, ${at_(5)}, ${at_(6)}, ?, ? FROM json_each(?)`,
              params: [at, ...actor, context.allowedBy ?? null, context.requestId, this.id, setParam(rows)],
            })
          }
          break
        }
        case 'event': {
          const rows = item.events.map((event) => {
            const record = ref(event.record)
            return [event.id, record.type, record.id, JSON.stringify(event.payload)]
          })
          if (!item.set) {
            const [id, type, recordId, payload] = rows[0]!
            statements.push({
              sql: 'INSERT INTO core_events (id, name, record_type, record_id, payload, announced_at, unit_id, dispatched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              params: [id, item.name, type, recordId, payload, at, this.id, at],
            })
          }
          else {
            sets.push(rows.length)
            statements.push({
              sql: `INSERT INTO core_events (id, name, record_type, record_id, payload, announced_at, unit_id, dispatched_at) SELECT ${at_(0)}, ?, ${at_(1)}, ${at_(2)}, ${at_(3)}, ?, ?, ? FROM json_each(?)`,
              params: [item.name, at, this.id, at, setParam(rows)],
            })
          }
          eventIds.push(...item.events.map(e => e.id))
          // Listeners become prompt-lane jobs in the same batch (E1, E3), one statement per listener
          // for a set. A listener of a module that is off now is not called, and is never caught up
          // later (E5).
          for (const listener of registry.listeners.get(item.name) ?? []) {
            if (!enabled!.has(listener.module)) continue
            const name = `${listener.module}.${listener.listener}`
            if (!item.set) {
              const event = item.events[0]!
              pushJob({ kind: 'job', id: newId('job'), name, payload: { eventId: event.id }, options: { lane: 'prompt', dedupeKey: `${event.id}` }, jobKind: 'listener', module: listener.module })
              continue
            }
            const jobRows = item.events.map(event => [newId('job'), JSON.stringify({ eventId: event.id }), event.id])
            sets.push(jobRows.length)
            statements.push({
              sql: `INSERT OR IGNORE INTO core_jobs (id, kind, name, module_id, lane, payload, dedupe_key, state, attempts, max_attempts, run_after, created_at) SELECT ${at_(0)}, 'listener', ?, ?, 'prompt', ${at_(1)}, ${at_(2)}, 'queued', 0, ?, ?, ? FROM json_each(?)`,
              params: [name, listener.module, maxAttempts, at, at, setParam(jobRows)],
            })
            // Event ids are new, so no listener job here can meet an unfinished duplicate. Every
            // job gets its message; a message for a row that is not queued is ignored (J1).
            for (const [id] of jobRows) jobSets.push({ id: id as string, lane: 'prompt' })
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
    if (sets.length) {
      const rowsLimit = await useSetting('core.units.set-rows-limit') as number
      const largest = Math.max(...sets)
      if (largest > rowsLimit) {
        this.state = 'open'
        throw new Refusal('core.unit.too-large', `This change writes ${largest} rows in one set, more than the limit of ${rowsLimit}, so nothing was saved.`, { status: 500 })
      }
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
    const messages: JobMessage[] = [...queued.map(j => ({ jobId: j.id, lane: j.lane, delaySeconds: j.delay || undefined })), ...jobSets.map(j => ({ jobId: j.id, lane: j.lane }))]
    await dispatch(messages)
    for (const hook of this.hooks) {
      try { await hook() }
      catch (error) { log.error('core.unit.after-commit-failed', { unitId: this.id, error: String((error as Error)?.message ?? error) }) }
    }
    return { unitId: this.id, results: added.map(i => results[i]!), eventIds, jobIds: [...queued.map(j => j.id), ...jobSets.map(j => j.id)] }
  }
}

/** A new unit of work. A route gets one from defineRoute; a job, listener or task from the runner. */
export function createUnit(): UnitOfWork {
  return new UnitOfWork()
}
