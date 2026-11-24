// Practice mode's declarations (T-PM-07, T-PM-08): what a practice store may copy of a table, and how
// each column's value arrives there. Then the frame's addresses (T-PM-13, T-PM-16).
import { describe, expect, it } from 'vitest'
import { integer, text } from 'drizzle-orm/sqlite-core'
import { col, defineTable, ERASED, columnMeta } from '#kit/db'
import { checkRouteDeclaration } from '#kit/route'
import { copiedValue } from '../../layers/core/server/practice/copy'
import { isPracticePath, liveOf, practiceKey, practiceOf, withinScenario } from '../../layers/core/shared/practice'

describe('the practice option on a table (T-PM-08)', () => {
  it('copies the theatre\'s setup', () => {
    expect(() => defineTable('pt_rooms', { id: col.id(), name: col.public(text('name').notNull()) }, { id: 'ptr', realm: 'operational', practice: 'copy' })).not.toThrow()
  })

  it('refuses to copy people\'s records, the record of what happened, or required special data', () => {
    expect(() => defineTable('pt_buyers', { id: col.id(), name: col.public(text('name')) }, { id: 'ptb', realm: 'audience', practice: 'copy' })).toThrow(/audience realm/)
    expect(() => defineTable('pt_members', { id: col.id(), name: col.public(text('name')) }, { id: 'ptm', realm: 'members', practice: 'copy' })).toThrow(/members realm/)
    expect(() => defineTable('pt_ledger', { id: col.id(), amount: col.minor('amount').notNull() }, { id: 'ptl', realm: 'operational', appendOnly: true, practice: 'copy' })).toThrow(/append-only/)
    const special = col.special('needs')
    ;(special as any).notNull()
    expect(() => defineTable('pt_needs', { id: col.id(), owner: col.account('account_id', { role: 'subject' }), needs: special }, { id: 'ptn', realm: 'operational', practice: 'copy' })).toThrow(/special data/)
    expect(() => defineTable('pt_odd', { id: col.id() }, { id: 'pto', realm: 'operational', practice: 'all' as never })).toThrow(/'empty', 'copy' or 'replace'/)
  })
})

describe('a copied value (T-PM-07)', () => {
  const meta = (builder: unknown) => columnMeta(builder)!
  it('keeps public and internal values, and points account columns at Practice staff', () => {
    expect(copiedValue(meta(col.public(text('name'))), 'Main house', 'acc_staff')).toBe('Main house')
    expect(copiedValue(meta(col.internal(integer('sort'))), 3, 'acc_staff')).toBe(3)
    expect(copiedValue(meta(col.account('changed_by', { role: 'actor', nullable: true })), 'acc_real', 'acc_staff')).toBe('acc_staff')
  })

  it('passes personal and free text through each column\'s erasure rule, and never copies special or sealed data', () => {
    expect(copiedValue(meta(col.personal(text('contact'))), 'Jo Bloggs', 's')).toBe(ERASED.anonymise)
    expect(copiedValue(meta(col.personal(text('contact'), { erase: 'clear' })), 'Jo Bloggs', 's')).toBeNull()
    expect(copiedValue(meta(col.freeText(text('note'))), 'Rang about seats', 's')).toBe(ERASED.redact)
    expect(copiedValue(meta(col.special('needs')), 'sealed', 's')).toBeNull()
    expect(copiedValue(meta(col.internal(text('secret'), { encrypted: true })), 'sealed', 's')).toBeNull()
    expect(copiedValue(meta(col.personal(text('contact'))), null, 's')).toBeNull()
  })
})

describe('a route\'s practice option', () => {
  it('is refuse, outside or ticks', () => {
    expect(() => checkRouteDeclaration({ ability: 'signed-in', rateLimit: 'default', practice: 'refuse' })).not.toThrow()
    expect(() => checkRouteDeclaration({ ability: 'signed-in', rateLimit: 'default', practice: 'ticks' })).not.toThrow()
    expect(() => checkRouteDeclaration({ ability: 'signed-in', rateLimit: 'default', practice: 'swap' as never })).toThrow(/'refuse', 'outside' or 'ticks'/)
  })
})

describe('practice addresses (T-PM-13, T-PM-16)', () => {
  it('knows a practice page from a live one', () => {
    expect(isPracticePath('/practice')).toBe(true)
    expect(isPracticePath('/practice/box-office.door?from=/members')).toBe(true)
    expect(isPracticePath('/practice/live/door/prf_1')).toBe(true)
    expect(isPracticePath('/practices')).toBe(false)
    expect(isPracticePath('/live/door')).toBe(false)
  })

  it('maps a live page into the frame and back', () => {
    expect(practiceOf('/live/door/prf_1?scan=1')).toBe('/practice/live/door/prf_1?scan=1')
    expect(practiceOf('/live')).toBe('/practice/live')
    expect(practiceOf('/console/programme')).toBeNull()
    expect(practiceOf('/lively')).toBeNull()
    expect(liveOf('/practice/live/door/prf_1?scan=1')).toBe('/live/door/prf_1')
    expect(liveOf('/practice/box-office.door')).toBeNull()
  })

  it('fences navigation to the scenario\'s routes and the Tonight hub', () => {
    expect(withinScenario('/live/door/prf_1', ['/live/door'])).toBe(true)
    expect(withinScenario('/live/door', ['/live/door/'])).toBe(true)
    expect(withinScenario('/live', ['/live/door'])).toBe(true)
    expect(withinScenario('/live/doorway', ['/live/door'])).toBe(false)
    expect(withinScenario('/live/till', ['/live/door'])).toBe(false)
  })

  it('keeps device copies apart', () => {
    expect(practiceKey('door:prf_1', true)).toBe('practice:door:prf_1')
    expect(practiceKey('door:prf_1', false)).toBe('door:prf_1')
  })
})
