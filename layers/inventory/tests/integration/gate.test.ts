// The gate (INV-01 to INV-04): one thing cannot be in two places at once. No individual item is
// promised to two loans whose windows overlap, an overdue one counting as open-ended; no counted item
// is promised beyond its quantity; a container goes whole; approval promises all lines or none; and
// every loan move is one guarded update (part 8, proof runs P-1 to P-6; rules C1 to C4, C6, L7, I7).
import { beforeAll, describe, expect, it } from 'vitest'
import { inContext, rows } from '../../../../tests/integration/helpers'
import { approveLoan, cancelLoan, getLoan, linesOf } from '../../server/loans'
import { at, attempt, day, item, member, promised, ready, request, shelf } from './stage'

beforeAll(ready)

const approve = (loanId: string) => attempt(unit => approveLoan(unit, loanId, member()))
const states = (loanId: string) => rows<{ state: string }>('SELECT state FROM inventory_loan_lines WHERE loan_id = ? ORDER BY sort, id', loanId).then(r => r.map(x => x.state))

describe('the write that cannot promise one thing twice (C1 to C3)', () => {
  it('P-1: of fifty loans of one item for the same window approved at once, one is promised and the rest are refused as a clash', async () => {
    const s = await shelf()
    const skull = await item(s)
    const loans = await Promise.all(Array.from({ length: 50 }, () => request(s, 1, 3, [{ itemId: skull }])))
    const outcomes = await Promise.all(loans.map(l => approve(l.id)))
    expect(outcomes.filter(o => o === 'ok')).toHaveLength(1)
    expect(outcomes.filter(o => o === 'inventory.loan.clash')).toHaveLength(49)
    expect(await promised(skull)).toHaveLength(1)
  })

  it('P-2: of fifty loans each overlapping its neighbour by a day, no two promised windows overlap and at least half stand', async () => {
    const s = await shelf()
    const lantern = await item(s)
    const loans = await Promise.all(Array.from({ length: 50 }, (_, i) => request(s, i, i + 1, [{ itemId: lantern }])))
    await Promise.all(loans.map(l => approve(l.id)))
    const held = await promised(lantern)
    for (let i = 1; i < held.length; i++) expect(held[i]!.starts_at).toBeGreaterThanOrEqual(held[i - 1]!.due_back_at)
    expect(held.length).toBeGreaterThanOrEqual(25)
  })

  it('P-3: twenty loans each asking for one of ten goblets: exactly ten are promised', async () => {
    const s = await shelf()
    const goblets = await item(s, { quantity: 10 })
    const loans = await Promise.all(Array.from({ length: 20 }, () => request(s, 2, 4, [{ itemId: goblets, quantity: 1 }])))
    const outcomes = await Promise.all(loans.map(l => approve(l.id)))
    expect(outcomes.filter(o => o === 'ok')).toHaveLength(10)
    expect(outcomes.filter(o => o === 'inventory.loan.clash')).toHaveLength(10)
  })

  it('P-4: thirty loans of one to four goblets over overlapping windows never add up to more than ten on any day', async () => {
    const s = await shelf()
    const goblets = await item(s, { quantity: 10 })
    const loans = await Promise.all(Array.from({ length: 30 }, (_, i) => request(s, i % 3, (i % 3) + 1, [{ itemId: goblets, quantity: (i % 4) + 1 }])))
    await Promise.all(loans.map(l => approve(l.id)))
    const held = await promised(goblets)
    for (let d = 0; d < 6; d++) {
      const noon = at(d, 12)
      const out = held.filter(h => h.starts_at < noon && h.due_back_at > noon).reduce((sum, h) => sum + h.quantity, 0)
      expect(out).toBeLessThanOrEqual(10)
    }
    expect(held.length).toBeGreaterThan(0)
  })

  it('P-5: an item out past its due date cannot be promised from tomorrow; once back, exactly one of twenty is', async () => {
    const s = await shelf()
    const hazer = await item(s)
    const first = await request(s, -60, -50, [{ itemId: hazer }])
    expect(await approve(first.id)).toBe('ok')
    await rows('UPDATE inventory_loan_lines SET state = \'out\', out_at = ? WHERE loan_id = ?', at(-60), first.id)
    await rows('UPDATE inventory_loans SET state = \'out\', out_at = ? WHERE id = ?', at(-60), first.id)
    const early = await Promise.all(Array.from({ length: 20 }, () => request(s, 1, 2, [{ itemId: hazer }])))
    expect((await Promise.all(early.map(l => approve(l.id)))).every(o => o === 'inventory.loan.clash')).toBe(true)
    await rows('UPDATE inventory_loan_lines SET state = \'returned\', returned_at = ? WHERE loan_id = ?', Date.now(), first.id)
    const later = await Promise.all(Array.from({ length: 20 }, () => request(s, 1, 2, [{ itemId: hazer }])))
    expect((await Promise.all(later.map(l => approve(l.id)))).filter(o => o === 'ok')).toHaveLength(1)
  })

  it('P-6: a container of five and one of its contents promised at once: the container whole, or the one item, never both', async () => {
    const s = await shelf()
    const flightCase = await item(s)
    const contents = await Promise.all(Array.from({ length: 5 }, () => item(s, { containerId: flightCase })))
    const whole = await request(s, 5, 7, [{ itemId: flightCase }])
    const single = await request(s, 6, 8, [{ itemId: contents[2]! }])
    const [a, b] = await Promise.all([approve(whole.id), approve(single.id)])
    expect([a, b].filter(o => o === 'ok')).toHaveLength(1)
    const caseLines = await rows<{ n: number }>('SELECT count(*) AS n FROM inventory_loan_lines WHERE loan_id = ? AND state = \'promised\'', whole.id)
    expect([0, 6]).toContain(caseLines[0]!.n)
    if (a === 'ok') expect(await rows('SELECT item_id FROM inventory_loan_lines WHERE loan_id = ? AND with_line_id IS NOT NULL ORDER BY item_id', whole.id)).toHaveLength(5)
  })

  it('touching windows do not clash: one loan due back the day before another starts', async () => {
    const s = await shelf()
    const crown = await item(s)
    const [a, b] = await Promise.all([request(s, 1, 2, [{ itemId: crown }]), request(s, 3, 4, [{ itemId: crown }])])
    expect([await approve(a.id), await approve(b.id)]).toEqual(['ok', 'ok'])
  })
})

describe('only usable items are promised (C4)', () => {
  it('refuses an item out of service, one proposed for disposal, and one overdue on a blocking inspection, but not on a non-blocking one', async () => {
    const s = await shelf()
    const broken = await item(s, { state: 'out-of-service' })
    expect(await approve((await request(s, 1, 2, [{ itemId: broken }])).id)).toBe('inventory.loan.clash')

    const going = await item(s)
    await rows('INSERT INTO inventory_disposals (id, item_id, method, proposed_by, created_at, updated_at) VALUES (?, ?, \'scrapped\', ?, ?, ?)', `kdis_${going.slice(4)}`, going, member(), Date.now(), Date.now())
    expect(await approve((await request(s, 1, 2, [{ itemId: going }])).id)).toBe('inventory.loan.clash')

    const untested = await item(s)
    const [blocking, warning] = [`kik_${untested.slice(4)}`, `kik_${untested.slice(4, -1)}x`]
    await rows('INSERT INTO inventory_inspection_kinds (id, name, interval_days, blocks_when_overdue, created_at, updated_at) VALUES (?, ?, 365, 1, ?, ?), (?, ?, 365, 0, ?, ?)',
      blocking, `PAT ${untested}`, Date.now(), Date.now(), warning, `Visual ${untested}`, Date.now(), Date.now())
    await rows('INSERT INTO inventory_inspection_dues (item_id, kind_id, source, next_due_on) VALUES (?, ?, \'item\', ?)', untested, warning, day(0))
    expect(await approve((await request(s, 3, 4, [{ itemId: untested }])).id)).toBe('ok')
    await rows('INSERT INTO inventory_inspection_dues (item_id, kind_id, source, next_due_on) VALUES (?, ?, \'item\', ?)', untested, blocking, day(5))
    expect(await approve((await request(s, 5, 6, [{ itemId: untested }])).id)).toBe('ok')
    expect(await approve((await request(s, 7, 8, [{ itemId: untested }])).id)).toBe('inventory.loan.clash')
  })
})

describe('approval is all or none, and every move is guarded (L7, I7, L3, L16)', () => {
  it('refuses the whole approval when one line is taken, naming it, and promises nothing', async () => {
    const s = await shelf()
    const [teapot, cup] = [await item(s), await item(s)]
    const first = await request(s, 1, 3, [{ itemId: cup }])
    expect(await approve(first.id)).toBe('ok')
    const second = await request(s, 2, 4, [{ itemId: teapot }, { itemId: cup }])
    const refused = await inContext(async () => {
      try {
        await approveLoan((await import('#kit')).createUnit().view(), second.id, member())
        return null
      }
      catch (error) { return error as { code: string, detail: Record<string, string> } }
    })
    expect(refused?.code).toBe('inventory.loan.clash')
    const cupLine = (await inContext(() => linesOf(second.id))).find(l => l.itemId === cup)!
    expect(refused?.detail).toEqual({ [cupLine.id]: `taken:${first.id}` })
    expect(await states(second.id)).toEqual(['listed', 'listed'])
    expect((await inContext(() => getLoan(second.id)))!.state).toBe('requested')
  })

  it('lets one of two approvers acting at once succeed', async () => {
    const s = await shelf()
    const loan = await request(s, 1, 2, [{ itemId: await item(s) }])
    const outcomes = await Promise.all([approve(loan.id), approve(loan.id)])
    expect(outcomes.filter(o => o === 'ok')).toHaveLength(1)
    expect(await states(loan.id)).toEqual(['promised'])
  })

  it('refuses a member\'s loan from a department that lends to productions only, and a line from another department', async () => {
    const productionsOnly = await shelf('productions')
    await expect(request(productionsOnly, 1, 2, [])).rejects.toThrow('inventory.loan.not-lent')
    const [mine, theirs] = [await shelf(), await shelf()]
    await expect(request(mine, 1, 2, [{ itemId: await item(theirs) }])).rejects.toThrow('inventory.line.wrong-item')
  })

  it('cancels an approved loan and frees its item, but never an out one', async () => {
    const s = await shelf()
    const wig = await item(s)
    const loan = await request(s, 1, 2, [{ itemId: wig }])
    expect(await approve(loan.id)).toBe('ok')
    expect(await attempt(async unit => cancelLoan(unit, (await getLoan(loan.id))!, null, 'by-staff'))).toBe('ok')
    expect(await states(loan.id)).toEqual(['cancelled'])
    expect(await promised(wig)).toEqual([])
    await rows('UPDATE inventory_loans SET state = \'out\', cancel_reason = NULL WHERE id = ?', loan.id)
    expect(await attempt(async unit => cancelLoan(unit, (await getLoan(loan.id))!, null, 'by-staff'))).toBe('inventory.loan.wrong-state')
  })
})
