// F-05: a write is one unit of work, committed as one D1 batch, guarded where rows are contended.
import { describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createUnit, isRefusal, newId, changeSetting } from '#kit'
import { ERASED } from '#kit/db'
import { env, inContext, performance, rows } from './helpers'

describe('a unit of work', () => {
  it('writes nothing, not even its audit entry or event, when an expectation fails', async () => {
    const id = newId('sp')
    const result = inContext(async () => {
      const unit = createUnit()
      unit.add(sql`INSERT INTO seats_performances (id, title, capacity) VALUES (${id}, 'Macbeth', 5)`)
      unit.audit({ action: 'seats.performance.created', record: ['seats.performance', id] })
      unit.announce('seats.performance.sold', { performanceId: id, quantity: 1 })
      unit.add(sql`UPDATE seats_performances SET sold = 1 WHERE id = 'sp_missing'`).expect(1, { code: 'seats.missing', reason: 'No such performance.' })
      return unit.commit()
    })
    await expect(result).rejects.toMatchObject({ code: 'seats.missing', status: 409 })
    expect(await rows('SELECT id FROM seats_performances WHERE id = ?', id)).toHaveLength(0)
    expect(await rows('SELECT id FROM core_audit WHERE record_id = ?', id)).toHaveLength(0)
    expect(await rows("SELECT id FROM core_events WHERE json_extract(payload, '$.performanceId') = ?", id)).toHaveLength(0)
  })

  it('writes the statements, audit entry and event together when every expectation holds', async () => {
    const id = newId('sp')
    const result = await inContext(async () => {
      const unit = createUnit()
      unit.add(sql`INSERT INTO seats_performances (id, title, capacity) VALUES (${id}, 'Macbeth', 5)`).expect(1)
      unit.audit({ action: 'seats.performance.created', record: ['seats.performance', id] })
      unit.announce('seats.performance.sold', { performanceId: id, quantity: 1 })
      return unit.commit()
    })
    expect(await rows('SELECT id FROM seats_performances WHERE id = ?', id)).toHaveLength(1)
    const audit = await rows<{ unit_id: string }>('SELECT unit_id FROM core_audit WHERE record_id = ?', id)
    expect(audit).toEqual([{ unit_id: result.unitId }])
    expect(await rows('SELECT id FROM core_events WHERE id = ?', result.eventIds[0])).toHaveLength(1)
  })

  it('lets exactly one of four concurrent claims win', async () => {
    const id = await performance()
    const claims = await Promise.allSettled([1, 2, 3, 4].map(n => inContext(async () => {
      const unit = createUnit()
      unit.add(sql`UPDATE seats_performances SET claimed_by = ${`claimant-${n}`} WHERE id = ${id} AND claimed_by IS NULL`)
        .expect(1, { code: 'seats.claimed', reason: 'Someone else claimed it first.' })
      return unit.commit()
    })))
    expect(claims.filter(c => c.status === 'fulfilled')).toHaveLength(1)
    const refused = claims.filter(c => c.status === 'rejected') as PromiseRejectedResult[]
    expect(refused).toHaveLength(3)
    for (const r of refused) expect(r.reason).toMatchObject({ code: 'seats.claimed' })
  })

  it('sells the last seat exactly once among twenty buyers, the CHECK constraint holding the line', async () => {
    const id = await performance(1)
    const buyers = await Promise.allSettled(Array.from({ length: 20 }, () => inContext(async () => {
      const unit = createUnit()
      // No condition in the WHERE clause on purpose: the table's CHECK (sold <= capacity) is the guard.
      unit.add(sql`UPDATE seats_performances SET sold = sold + 1 WHERE id = ${id}`).expect(1)
      return unit.commit()
    })))
    expect(buyers.filter(b => b.status === 'fulfilled')).toHaveLength(1)
    expect(await rows('SELECT sold FROM seats_performances WHERE id = ?', id)).toEqual([{ sold: 1 }])
  })

  it('refuses to change or delete an append-only row, except to erase it', async () => {
    const performanceId = await performance()
    const id = newId('sl')
    await env.DB.prepare('INSERT INTO seats_ledger (id, performance_id, quantity, buyer_id, buyer_name, note, created_at) VALUES (?, ?, 2, ?, ?, ?, ?)')
      .bind(id, performanceId, 'acc_buyer', 'Ann Buyer', 'Wheelchair space please', Date.now()).run()
    await expect(env.DB.prepare('UPDATE seats_ledger SET quantity = 3 WHERE id = ?').bind(id).run()).rejects.toThrow(/append-only: seats_ledger/)
    await expect(env.DB.prepare('DELETE FROM seats_ledger WHERE id = ?').bind(id).run()).rejects.toThrow(/append-only: seats_ledger/)
    await expect(env.DB.prepare('UPDATE seats_ledger SET buyer_name = ? WHERE id = ?').bind('Someone Else', id).run()).rejects.toThrow(/append-only/)
    await env.DB.prepare('UPDATE seats_ledger SET buyer_name = ?, note = ? WHERE id = ?').bind(ERASED.anonymise, ERASED.redact, id).run()
    expect(await rows('SELECT quantity, buyer_name, note FROM seats_ledger WHERE id = ?', id)).toEqual([{ quantity: 2, buyer_name: 'Former member', note: '[removed]' }])
  })

  it('gives a service no way to commit', async () => {
    await inContext(async () => {
      const view = createUnit().view() as unknown as { commit: () => unknown }
      expect(() => view.commit()).toThrow(/A service never commits/)
    })
  })

  it('refuses a unit with more statements than the limit before running any of them', async () => {
    await inContext(async () => {
      const unit = createUnit()
      await changeSetting(unit.view(), 'core.units.statement-limit', 10, { reason: 'test' })
      await unit.commit()
    })
    const ids = Array.from({ length: 11 }, () => newId('sp'))
    const result = inContext(async () => {
      const unit = createUnit()
      for (const id of ids) unit.add(sql`INSERT INTO seats_performances (id, title, capacity) VALUES (${id}, 'Big', 1)`)
      return unit.commit()
    })
    await expect(result).rejects.toMatchObject({ code: 'core.unit.too-large' })
    expect(await rows(`SELECT id FROM seats_performances WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids)).toHaveLength(0)
    await inContext(async () => {
      const unit = createUnit()
      await changeSetting(unit.view(), 'core.units.statement-limit', null, { reset: true, reason: 'test' })
      await unit.commit()
    })
  })

  it('keeps the commit when an after-commit hook throws', async () => {
    const id = newId('sp')
    let ran = false
    await inContext(async () => {
      const unit = createUnit()
      unit.add(sql`INSERT INTO seats_performances (id, title, capacity) VALUES (${id}, 'Lear', 5)`)
      unit.afterCommit(() => {
        ran = true
        throw new Error('the mail server is down')
      })
      await unit.commit()
    })
    expect(ran).toBe(true)
    expect(await rows('SELECT id FROM seats_performances WHERE id = ?', id)).toHaveLength(1)
  })

  it('turns a failed guard into a refusal, never a database error', async () => {
    const outcome = await inContext(async () => {
      const unit = createUnit()
      unit.add(sql`UPDATE seats_performances SET sold = 0 WHERE id = 'sp_none'`).expect(1, { code: 'seats.none', reason: 'Nothing to update.' })
      return unit.commit().catch(error => error)
    })
    expect(isRefusal(outcome)).toBe(true)
  })
})
