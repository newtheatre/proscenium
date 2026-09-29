import { Database } from 'bun:sqlite'

// A suite opens the dev server's own database file beside it, and the server may be mid-write:
// every file connection waits out a lock, as the reset does, rather than failing on the spot.
const BUSY_TIMEOUT_MS = 10_000

const waiting = new WeakSet<Database>()
const setTimeoutOn = Database.prototype.run

function waitsOnLocks(database: Database): void {
  if (waiting.has(database) || !database.filename || database.filename === ':memory:') return
  waiting.add(database)
  setTimeoutOn.call(database, `PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`)
}

for (const method of ['query', 'prepare', 'run', 'exec', 'transaction'] as const) {
  const original = Database.prototype[method] as (...args: unknown[]) => unknown
  Object.defineProperty(Database.prototype, method, {
    configurable: true,
    writable: true,
    value: function (this: Database, ...args: unknown[]): unknown {
      waitsOnLocks(this)
      return original.apply(this, args)
    },
  })
}
