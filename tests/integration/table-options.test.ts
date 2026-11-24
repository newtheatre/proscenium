// R3-23: a table declared timestamps: false and withoutRowid: true keeps rows that cannot be dated,
// neither by a time column, nor a time-sorted id, nor the order SQLite stored them in.
import { describe, expect, it } from 'vitest'
import { createUnit, isId } from '#kit'
import { ballots } from '../fixtures/modules/notify/server/db/schema'
import { env, inContext, rows } from './helpers'

describe('a table that keeps no times', () => {
  it('is made WITHOUT ROWID, so it has no rowid to read', async () => {
    const [made] = await rows<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'notify_ballots'")
    expect(made?.sql).toMatch(/\) WITHOUT ROWID$/)
    await expect(env.DB.prepare('SELECT rowid FROM notify_ballots').all()).rejects.toThrow(/no such column: rowid/)
  })

  it('gets random ids that say nothing of when a row was written, and returns rows in id order', async () => {
    const ids = await inContext(async () => {
      const unit = createUnit()
      const ids = unit.insertSet(ballots, Array.from({ length: 20 }, (_, i) => ({ choice: `c${i}` })))
      unit.expect(20)
      await unit.commit()
      return ids
    })
    expect(ids.every(id => isId('nbl', id))).toBe(true)
    expect(ids).not.toEqual([...ids].sort())
    const stored = (await rows<{ id: string }>('SELECT id FROM notify_ballots')).map(r => r.id).filter(id => ids.includes(id))
    expect(stored).toEqual([...ids].sort())
  })
})
