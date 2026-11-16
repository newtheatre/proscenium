// List search (Foundations part 4, "Lists", S1 to S5; proof P-LIST-1): the generated index finds every
// word in any searched field, ignoring case and accents, and an erasure leaves it in the same statement.
import { describe, expect, it } from 'vitest'
import { newId, searchQuery, searchWords } from '#kit'
import { ERASED } from '#kit/db'
import { env, performance, rows } from './helpers'

async function sale(performanceId: string, buyerName: string, note: string | null = null): Promise<string> {
  const id = newId('sl')
  await env.DB.prepare('INSERT INTO seats_ledger (id, performance_id, quantity, buyer_id, buyer_name, note, created_at) VALUES (?, ?, 1, ?, ?, ?, ?)').bind(id, performanceId, newId('acc'), buyerName, note, Date.now()).run()
  return id
}

const find = async (q: string, columns = ['buyer_name', 'note']) => {
  const { words } = searchWords(q)
  return (await rows<{ id: string }>('SELECT id FROM seats_ledger WHERE rowid IN (SELECT rowid FROM seats_ledger_search WHERE seats_ledger_search MATCH ?) ORDER BY id', searchQuery(words, columns))).map(r => r.id)
}

describe('a generated search index', () => {
  it('is made with secure-delete on and its triggers in place', async () => {
    expect(await rows("SELECT v FROM seats_ledger_search_config WHERE k = 'secure-delete'")).toEqual([{ v: 1 }])
    const triggers = (await rows<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'seats_ledger' AND name LIKE 'seats_ledger_search_%' ORDER BY name")).map(r => r.name)
    expect(triggers).toEqual(['seats_ledger_search_delete', 'seats_ledger_search_insert', 'seats_ledger_search_update'])
  })

  it('finds every word in any searched field, ignoring case and accents, and parts of words', async () => {
    const show = await performance()
    const zoe = await sale(show, 'Zoë Brontë', 'Wheelchair space')
    const chloe = await sale(show, 'Chloé Brontë', 'Gift for Zoë')
    await sale(show, 'Tom Brontë')
    expect(await find('zoe')).toEqual([zoe, chloe].sort())
    expect(await find('ZOË wheel')).toEqual([zoe])
    expect(await find('bront chair')).toEqual([zoe])
    // A field the viewer may not see is left out of the search for them.
    expect(await find('zoe', ['buyer_name'])).toEqual([zoe])
  })

  it('forgets an erased value in the erasure\'s own statement', async () => {
    const show = await performance()
    const id = await sale(show, 'Siân Brontë-Okafor')
    expect(await find('okafor')).toEqual([id])
    await env.DB.prepare('UPDATE seats_ledger SET buyer_name = ? WHERE id = ?').bind(ERASED.anonymise, id).run()
    expect(await find('okafor')).toEqual([])
    expect(await find('former member')).toContain(id)
  })
})
