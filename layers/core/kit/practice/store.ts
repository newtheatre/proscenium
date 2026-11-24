// A person's practice store (Practice mode, part 2; proof P-PM-1): a SQLite-backed Durable Object,
// one per person, made from the same migration bundle as D1 and deleted when practice ends. It
// answers statements the way D1 does, so the kit runs against it through storeDatabase unchanged.
import { DurableObject } from 'cloudflare:workers'
import type { StoreAnswer, StoreStatement } from './database'

type Value = string | number | null | ArrayBuffer

export class PracticeStore extends DurableObject {
  /** One statement, outside any transaction, as D1's run, all, first and raw are. */
  query(statement: StoreStatement): StoreAnswer {
    return this.exec(statement)
  }

  /** Every statement or none, as D1's batch commits: a throw rolls the whole batch back. */
  batch(statements: StoreStatement[]): StoreAnswer[] {
    return this.ctx.storage.transactionSync(() => statements.map(s => this.exec(s)))
  }

  /** Deletes everything the store holds: its tables, indexes, triggers and any alarm. */
  async destroy(): Promise<void> {
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
  }

  override async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll()
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
