// List search (Foundations part 4, "Lists", S1 to S5; proof P-LIST-1): the generated index finds every
// word in any searched field, ignoring case and accents, and an erasure leaves it in the same statement.
import { describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, searchQuery, searchWords } from '#kit'
import { ERASED } from '#kit/db'
import { env, inContext, performance, person, rows } from './helpers'

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

  it('leaves a unit\'s expectations true after a write to a searched table', async () => {
    // FTS5 writes out what it holds in memory when the next write opens a savepoint, which would
    // change changes() under a guard that is itself a write. The guard is a read, so it does not.
    const show = await performance()
    const attempt = inContext(async () => {
      const unit = createUnit()
      unit.add({ sql: 'INSERT INTO seats_ledger (id, performance_id, quantity, buyer_id, buyer_name, created_at) VALUES (?, ?, 1, ?, ?, ?)', params: [newId('sl'), show, newId('acc'), 'Ola Okafor', Date.now()] })
      unit.add({ sql: "UPDATE seats_performances SET sold = 1 WHERE id = 'sp_missing'", params: [] }).expect(1, { code: 'seats.missing', reason: 'No such performance.' })
      return unit.commit()
    })
    await expect(attempt).rejects.toMatchObject({ code: 'seats.missing' })
    expect(await find('ola okafor')).toEqual([])
  })
})

describe('readList', async () => {
  const { readListQuery, useDb } = await import('#kit')
  const { count } = await import('drizzle-orm')
  const { ledger, performances } = await import('../fixtures/modules/seats/server/db/schema')
  const sales = (await import('../fixtures/modules/seats/server/lists/sales')).default
  const shows = (await import('../fixtures/modules/seats/server/lists/performances')).default
  const seller = () => person(['seats.orders.sell'])
  const nobody = () => person([])

  const page = (query: Record<string, string>, actor = seller(), show?: string) => inContext(async () => {
    const read = await readListQuery(show ? { ...query, performance: show } : query, sales)
    const found = await useDb().select({ id: ledger.id, buyerName: ledger.buyerName, note: ledger.note, quantity: ledger.quantity }).from(ledger).where(read.where()).orderBy(...read.orderBy()).limit(read.limit).offset(read.offset)
    const [{ n }] = await useDb().select({ n: count() }).from(ledger).where(read.where()) as [{ n: number }]
    return { read, found, total: n, matched: read.matched(found) }
  }, actor)

  it('searches every field the viewer may see, and names a hidden field that matched', async () => {
    const show = await performance()
    const ada = await sale(show, 'Ada Pemberton', 'Booked by Quilliam')
    const quilliam = await sale(show, 'Rex Quilliam', null)
    const both = await page({ q: 'quilliam' }, seller(), show)
    expect(both.found.map(r => r.id).sort()).toEqual([ada, quilliam].sort())
    expect(both.total).toBe(2)
    expect(Object.fromEntries(both.found.map((r, i) => [r.id, both.matched[i]]))).toEqual({ [ada]: 'note', [quilliam]: null })
    expect(both.read.answer(both.found, both.total).matched).toEqual({ [ada]: 'note' })
    // Without the ability that shows buyers' names, only the note is searched.
    const notes = await page({ q: 'quilliam' }, nobody(), show)
    expect(notes.found.map(r => r.id)).toEqual([ada])
  })

  it('ignores words under three letters, and says when nothing was searched', async () => {
    const show = await performance()
    await sale(show, 'Ida Pemberton')
    await sale(show, 'Bo Pemberton')
    const short = await page({ q: 'Bo' }, seller(), show)
    expect(short.read).toMatchObject({ words: [], ignoredWords: ['Bo'], searchTooShort: true })
    expect(short.total).toBe(2)
    const mixed = await page({ q: 'bo pemb' }, seller(), show)
    expect(mixed.read).toMatchObject({ words: ['pemb'], ignoredWords: ['bo'], searchTooShort: false })
    expect(mixed.read.answer([], 0)).toEqual({ rows: [], total: 0, dropped: [], ignoredWords: ['bo'], searchTooShort: false, matched: {} })
    expect(short.read.answer([], 0)).toEqual({ rows: [], total: 0, dropped: [], ignoredWords: ['Bo'], searchTooShort: true })
  })

  it('applies filters, drops one the viewer may not use, and ends every sort with the id', async () => {
    const show = await performance()
    const one = await sale(show, 'Single Buyer')
    const group = newId('sl')
    await env.DB.prepare('INSERT INTO seats_ledger (id, performance_id, quantity, buyer_id, buyer_name, created_at) VALUES (?, ?, 4, ?, ?, ?)').bind(group, show, newId('acc'), 'Group Buyer', Date.now()).run()
    expect((await page({ sizes: 'group' }, seller(), show)).found.map(r => r.id)).toEqual([group])
    expect((await page({ sizes: 'single,group' }, seller(), show)).total).toBe(2)
    const dropped = await page({ buyer: newId('acc') }, nobody(), show)
    expect(dropped.read.dropped).toEqual(['buyer'])
    expect(dropped.total).toBe(2)
    expect((await page({ buyer: newId('acc') }, seller(), show)).total).toBe(0)
    const sorted = await page({ order: 'asc' }, seller(), show)
    expect(sorted.read.sort).toEqual({ key: 'at', order: 'asc' })
    expect(sorted.found.map(r => r.id)).toEqual([one, group])
  })

  it('refuses to search a field under an ability audited on read, until such a search is audited', async () => {
    const { defineListSource } = await import('#kit')
    const audited = defineListSource(sales.list, { table: ledger, filters: { performance: { column: 'performanceId' }, sizes: { column: 'quantity' }, buyer: { column: 'buyer' } }, sorts: { at: { columns: ['at'], bounded: 10 } }, search: { buyerName: { column: 'buyerName', ability: 'seats.members.look-up' }, quantity: false, note: 'note' } } as any)
    await expect(inContext(() => readListQuery({}, audited), seller())).rejects.toThrow(/audited on read/)
  })

  it('refuses a key the list does not take, and a page too deep', async () => {
    await expect(page({ colour: 'red' })).rejects.toMatchObject({ code: 'core.list.unknown', fields: { colour: 'core.list.unknown' } })
    await expect(page({ sizes: 'huge' })).rejects.toMatchObject({ code: 'core.list.unknown', fields: { sizes: 'core.list.unknown' } })
    await expect(page({ page: '401', size: '25' })).rejects.toMatchObject({ code: 'core.list.too-deep' })
    await expect(page({ page: '100', size: '100' })).resolves.toBeTruthy()
  })

  it('filters by a day on a date column and by a condition the source writes', async () => {
    const id = newId('sp')
    await env.DB.prepare('INSERT INTO seats_performances (id, title, capacity, sold, operating_day) VALUES (?, ?, 2, 2, ?)').bind(id, 'Pericles Matinée', '2026-03-04').run()
    await inContext(async () => {
      const unit = createUnit()
      await changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { confirm: true })
      await unit.commit()
    })
    const read = (query: Record<string, string>) => inContext(async () => {
      const r = await readListQuery(query, shows)
      return (await useDb().select({ id: performances.id }).from(performances).where(r.where()).orderBy(...r.orderBy())).map(x => x.id)
    })
    expect(await read({ q: 'pericles matinee' })).toEqual([id])
    expect(await read({ q: 'pericles', day: '2026-03-04' })).toEqual([id])
    expect(await read({ q: 'pericles', day: '2026-03-05..2026-03-09' })).toEqual([])
    expect(await read({ q: 'pericles', full: 'yes' })).toEqual([id])
    expect(await read({ q: 'pericles', full: 'no' })).toEqual([])
    await inContext(async () => {
      const unit = createUnit()
      await changeSetting(unit.view(), 'core.locale.time-zone', null, { reset: true, confirm: true })
      await unit.commit()
    })
  })
})
