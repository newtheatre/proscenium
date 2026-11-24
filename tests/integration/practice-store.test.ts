// Proof P-PM-1 (Practice mode, PM-01), the parts workerd can prove: a per-person Durable Object's
// SQLite stands in for D1. The bundle applies whole, a unit commits whole or not at all, an
// append-only table refuses an update, and stores made at once never see each other's rows.
import { describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createUnit } from '#kit'
import { runInContext, SYSTEM } from '#kit/context'
import { applyMigrations } from '#kit/migrations'
import { newId } from '#kit/ids'
import { storeDatabase, type StoreStub } from '#kit/practice/database'
import { env } from './helpers'

const practice = (env as unknown as { PRACTICE: DurableObjectNamespace }).PRACTICE
const storeFor = (name = newId('acc')) => practice.get(practice.idFromName(`practice:${name}`)) as unknown as StoreStub & { destroy: () => Promise<void> }
const inStore = <T>(db: D1Database, fn: () => Promise<T>) => runInContext({ env: { ...env, DB: db }, actor: SYSTEM, cache: {}, requestId: newId('req') }, fn)
const schema = async (db: D1Database) => (await db.prepare("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY type, name").all<{ type: string, name: string }>()).results

async function madeStore() {
  const stub = storeFor()
  const db = storeDatabase(stub)
  const started = performance.now()
  await inStore(db, () => applyMigrations(db))
  return { stub, db, ms: performance.now() - started }
}

describe('a practice store (P-PM-1)', () => {
  it('run 1: takes the whole migration bundle, every table, index, trigger and search table D1 has', async () => {
    const { stub, db, ms } = await madeStore()
    const made = await schema(db)
    expect(made).toEqual(await schema(env.DB))
    expect(made.filter(o => o.type === 'trigger').length).toBeGreaterThan(0)
    expect(made.some(o => o.type === 'table' && /fts|search/.test(o.name))).toBe(true)
    console.info(`P-PM-1 run 1: bundle applied in ${Math.round(ms)} ms, ${made.length} objects`)
    await stub.destroy()
  })

  it('run 2: a 20-statement unit whose last statement fails its expectation leaves nothing behind', async () => {
    const { stub, db } = await madeStore()
    const ids = Array.from({ length: 19 }, () => newId('sp'))
    const result = inStore(db, async () => {
      const unit = createUnit()
      for (const id of ids) unit.add(sql`INSERT INTO seats_performances (id, title, capacity) VALUES (${id}, 'Macbeth', 5)`).expect(1)
      unit.add(sql`UPDATE seats_performances SET sold = 1 WHERE id = 'sp_missing'`).expect(1, { code: 'seats.missing', reason: 'No such performance.' })
      return unit.commit()
    })
    await expect(result).rejects.toMatchObject({ code: 'seats.missing' })
    expect(await db.prepare('SELECT count(*) AS n FROM seats_performances').first('n')).toBe(0)
    expect(await db.prepare('SELECT count(*) AS n FROM core_audit').first('n')).toBe(0)
    await stub.destroy()
  })

  it('run 2: and the same unit commits whole, counting its rows as D1 does, when every expectation holds', async () => {
    const { stub, db } = await madeStore()
    const id = newId('sp')
    await inStore(db, async () => {
      const unit = createUnit()
      unit.add(sql`INSERT INTO seats_performances (id, title, capacity) VALUES (${id}, 'Macbeth', 5)`).expect(1)
      unit.add(sql`UPDATE seats_performances SET sold = 2 WHERE id = ${id} AND sold = 0`).expect(1)
      unit.audit({ action: 'seats.performance.created', record: ['seats.performance', id] })
      return unit.commit()
    })
    expect(await db.prepare('SELECT sold FROM seats_performances WHERE id = ?').bind(id).first('sold')).toBe(2)
    expect((await db.prepare('UPDATE seats_performances SET sold = 3 WHERE id = ?').bind(id).run()).meta.changes).toBe(1)
    expect((await db.prepare('UPDATE seats_performances SET sold = 3 WHERE id = ?').bind('sp_missing').run()).meta.changes).toBe(0)
    await stub.destroy()
  })

  it('run 3: refuses an update of an append-only table, through its trigger, as D1 does', async () => {
    const { stub, db } = await madeStore()
    const id = newId('aud')
    await db.prepare("INSERT INTO core_audit (id, at, actor_kind, action) VALUES (?, 0, 'system', 'state')").bind(id).run()
    await expect(db.prepare("UPDATE core_audit SET action = 'changed' WHERE id = ?").bind(id).run()).rejects.toThrow()
    await expect(db.prepare('DELETE FROM core_audit WHERE id = ?').bind(id).run()).rejects.toThrow()
    expect(await db.prepare('SELECT action FROM core_audit WHERE id = ?').bind(id).first('action')).toBe('state')
    await stub.destroy()
  })

  it('run 6: stores made at once all succeed, and none sees another\'s rows', async () => {
    const made = await Promise.all(Array.from({ length: 50 }, async () => {
      const store = await madeStore()
      const id = newId('sp')
      await store.db.prepare("INSERT INTO seats_performances (id, title, capacity) VALUES (?, 'Mine', 1)").bind(id).run()
      return { ...store, id }
    }))
    for (const { db, id } of made) expect((await db.prepare('SELECT id FROM seats_performances').all()).results).toEqual([{ id }])
    expect(await env.DB.prepare("SELECT count(*) AS n FROM seats_performances WHERE title = 'Mine'").first('n')).toBe(0)
    console.info(`P-PM-1 run 6: 50 stores made at once, median ${Math.round(made.map(m => m.ms).sort((a, b) => a - b)[25]!)} ms`)
    await Promise.all(made.map(m => m.stub.destroy()))
  }, 60_000) // not-policy: workerd runs every store on one thread, so fifty queue behind each other

  it('is empty once destroyed', async () => {
    const name = newId('acc')
    const db = storeDatabase(storeFor(name))
    await inStore(db, () => applyMigrations(db))
    await storeFor(name).destroy()
    expect(await schema(storeDatabase(storeFor(name)))).toEqual([])
  })
})
