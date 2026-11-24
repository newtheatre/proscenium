// A person's practice store (Practice mode, part 2; proof P-PM-1): a SQLite-backed Durable Object,
// one per person, made from the same migration bundle as D1 and deleted when practice ends. It
// answers statements the way D1 does, so the kit runs against it through storeDatabase unchanged.
import { DurableObject } from 'cloudflare:workers'
import type { StoreAnswer, StoreStatement } from './database'
import { cachePrefix, endedKey, filesPrefix } from './env'

type Value = string | number | null | ArrayBuffer
interface StoreBindings { FILES?: R2Bucket, CACHE?: KVNamespace }

export class PracticeStore extends DurableObject<StoreBindings> {
  /** One statement, outside any transaction, as D1's run, all, first and raw are. */
  query(statement: StoreStatement): StoreAnswer {
    return this.exec(statement)
  }

  /** Every statement or none, as D1's batch commits: a throw rolls the whole batch back. */
  batch(statements: StoreStatement[]): StoreAnswer[] {
    return this.ctx.storage.transactionSync(() => statements.map(s => this.exec(s)))
  }

  /** Deletes everything the store holds, with its files and cache keys. */
  async destroy(): Promise<void> {
    await this.cleanUp(this.session())
  }

  /** The session row, or null for a store never made (which has no tables to ask). */
  sessionRow(): Record<string, unknown> | null {
    const made = this.ctx.storage.sql.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'core_practice_session'").toArray().length > 0
    return made ? this.ctx.storage.sql.exec('SELECT * FROM core_practice_session LIMIT 1').toArray()[0] ?? null : null
  }

  /** Deletes the store at this time unless it is moved on first (rule S5). */
  async endAt(at: number): Promise<void> {
    await this.ctx.storage.setAlarm(at)
  }

  override async alarm(): Promise<void> {
    const session = this.session()
    if (session && this.env.CACHE) {
      const reason = session.nightEndsAt !== null && Date.now() >= session.nightEndsAt ? 'night' : 'idle'
      await this.env.CACHE.put(endedKey(session.accountId), JSON.stringify({ reason, scenarioId: session.scenarioId }), { expirationTtl: 86_400 }) // not-policy: the Ended screen's note lasts a day
    }
    await this.cleanUp(session)
  }

  private session(): { accountId: string, scenarioId: string, nightEndsAt: number | null } | null {
    const row = this.sessionRow() as { account_id: string, scenario_id: string, night_ends_at: number | null } | null
    return row ? { accountId: row.account_id, scenarioId: row.scenario_id, nightEndsAt: row.night_ends_at } : null
  }

  private async cleanUp(session: { accountId: string } | null): Promise<void> {
    if (session) {
      await this.clearFiles(session.accountId)
      await this.clearCache(session.accountId)
    }
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
  }

  private async clearFiles(accountId: string): Promise<void> {
    const { FILES } = this.env
    if (!FILES) return
    for (let cursor: string | undefined, page: R2Objects; ; cursor = page.cursor) {
      page = await FILES.list({ prefix: filesPrefix(accountId), cursor })
      if (page.objects.length) await FILES.delete(page.objects.map(o => o.key))
      if (!page.truncated) break
    }
  }

  private async clearCache(accountId: string): Promise<void> {
    const { CACHE } = this.env
    if (!CACHE) return
    for (let cursor: string | undefined, page: KVNamespaceListResult<unknown>; ; cursor = page.list_complete ? undefined : page.cursor) {
      page = await CACHE.list({ prefix: cachePrefix(accountId), cursor })
      await Promise.all(page.keys.map(k => CACHE.delete(k.name)))
      if (page.list_complete) break
    }
  }

  private exec({ sql, params }: StoreStatement): StoreAnswer {
    const started = performance.now()
    const cursor = this.ctx.storage.sql.exec(sql, ...(params as Value[]))
    const columns = cursor.columnNames
    const rows = [...cursor.raw()].map(row => row.map(cell => cell instanceof ArrayBuffer ? [...new Uint8Array(cell)] : cell))
    // D1 reports SQLite's own count of changed rows; a statement that wrote nothing changed nothing.
    const counts = cursor.rowsWritten
      ? this.ctx.storage.sql.exec<{ changes: number, last: number }>('SELECT changes() AS changes, last_insert_rowid() AS last').one()
      : { changes: 0, last: 0 }
    return { columns, rows, changes: counts.changes, lastRowId: counts.last, rowsRead: cursor.rowsRead, rowsWritten: cursor.rowsWritten, duration: performance.now() - started }
  }
}
