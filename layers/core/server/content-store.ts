// Nuxt Content loads each collection into D1 in whichever request first asks after a deploy, and a
// load cut short leaves it "not ready" for good, so every read waits 90 s (docs/kit, "The content store").
import { log } from '#kit/log'

const STUCK = 120_000 // not-policy: a load takes seconds, so one unfinished after two minutes was cut short
const MARK_TTL = 86_400 // not-policy: seconds a "first seen not ready" mark is kept in KV

interface Row { id: string, version: string | null, ready: number | null }
type Query = (collection: string, sql: string) => Promise<unknown>

/** Clears a collection's load that has stayed unfinished, then loads every collection here, in the tick rather than a visitor's request. */
export async function mendContentStore(db: D1Database, cache: KVNamespace | undefined, at: number, query: Query): Promise<{ cleared: string[], loaded: string[] }> {
  const rows = await db.prepare('SELECT id, version, ready FROM _content_info').all<Row>().then(r => r.results, () => [] as Row[])
  const cleared: string[] = []
  const ready: string[] = []
  for (const row of rows) {
    if (!row.id.startsWith('checksum_')) continue
    const collection = row.id.slice('checksum_'.length)
    if (row.ready) {
      ready.push(collection)
      continue
    }
    if (!cache) continue
    const mark = `core:content-unready:${row.id}:${row.version ?? ''}`
    const first = await cache.get(mark)
    if (first === null) {
      await cache.put(mark, String(at), { expirationTtl: MARK_TTL })
      continue
    }
    if (at - Number(first) < STUCK) continue
    await db.prepare('DELETE FROM _content_info WHERE id = ? AND NOT ready').bind(row.id).run()
    await cache.delete(mark)
    log.warn('core.content.load-cleared', { collection })
    cleared.push(collection)
  }
  const loaded: string[] = []
  // A ready collection may be the previous deploy's: asking for one row loads this deploy's if so.
  for (const collection of [...cleared, ...ready]) {
    if (!/^[a-z_]\w*$/i.test(collection)) continue
    try {
      await query(collection, `SELECT * FROM _content_${collection} ORDER BY id ASC LIMIT 1`)
      loaded.push(collection)
    }
    catch (error) {
      log.error('core.content.load-failed', { collection, error: String((error as Error)?.message ?? error) })
    }
  }
  return { cleared, loaded }
}
