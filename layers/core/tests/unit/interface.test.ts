// The pure parts of the interface: where an address belongs, the fixed order of console groups,
// the list's address query and CSV, the three-way merge of a stale save, and how settings become
// control values and back.
import { describe, expect, it } from 'vitest'
import { entryLabelKey, groupLabelKey, orderGroups, resolveEntry, shellOf } from '../../shared/navigation'
import { activeFilterCount, parseList, serialiseList, toCsv } from '../../shared/list'
import { isConflict, mergeConflict } from '../../shared/form'
import { controlText, durationText, fromControl, toControl } from '../../shared/controls'

describe('shells and entries (UI-08)', () => {
  it('knows which shell an address belongs to', () => {
    expect(shellOf('/console/bar/stock')).toBe('console')
    expect(shellOf('/console')).toBe('console')
    expect(shellOf('/account?tab=1')).toBe('account')
    expect(shellOf('/consoles')).toBeUndefined()
    expect(shellOf('/whats-on')).toBeUndefined()
  })

  it('resolves an address to the entry that covers it, preferring the longest', () => {
    const entries = [{ id: 'a', to: '/console/bar' }, { id: 'b', to: '/console/bar/stock', match: '/console/bar/stock-take' }]
    expect(resolveEntry(entries, '/console/bar/tabs/4')?.id).toBe('a')
    expect(resolveEntry(entries, '/console/bar/stock/')?.id).toBe('b')
    expect(resolveEntry(entries, '/console/bar/stock-take/3')?.id).toBe('b')
    expect(resolveEntry(entries, '/console/barn')).toBeUndefined()
  })

  it('derives translation keys from ids', () => {
    expect(entryLabelKey('bar.stock')).toBe('bar.navigation.stock.label')
    expect(groupLabelKey('bar', 'bar')).toBe('bar.navigation.groups.bar.label')
  })

  it('keeps the platform groups in their fixed order and places a theatre group where it asks', () => {
    const ordered = orderGroups([{ id: 'reports' }, { id: 'box-office' }, { id: 'tonight' }, { id: 'rehearsals', after: 'box-office' }, { id: 'spare', before: 'absent-group' }, { id: 'system' }])
    expect(ordered.map(g => g.id).slice(0, 4)).toEqual(['tonight', 'box-office', 'rehearsals', 'reports'])
    expect(ordered.at(-1)?.id).toBe('spare')
    expect(ordered.at(-2)?.id).toBe('system')
  })

  it('places a theatre group after a platform group the viewer has nothing in', () => {
    const ordered = orderGroups([{ id: 'money' }, { id: 'rehearsals', after: 'bar' }, { id: 'tonight' }])
    expect(ordered.map(g => g.id)).toEqual(['tonight', 'rehearsals', 'money'])
  })
})

describe('list state in the address (UI-11)', () => {
  it('reads and writes the same query, leaving out defaults', () => {
    const defaults = { sort: 'title', order: 'asc' as const }
    const state = parseList({ q: 'ham', status: 'draft', sort: 'seats', order: 'desc', page: '2' }, ['status'], defaults)
    expect(state).toMatchObject({ search: 'ham', filters: { status: 'draft' }, sort: 'seats', order: 'desc', page: 2, pageSize: 25 })
    expect(serialiseList(state, defaults)).toEqual({ q: 'ham', status: 'draft', sort: 'seats', order: 'desc', page: '2' })
    expect(serialiseList(parseList({}, ['status'], defaults), defaults)).toEqual({})
  })

  it('ignores nonsense and filters that are not declared', () => {
    const state = parseList({ page: '-3', size: 'abc', other: 'x', order: 'sideways' }, ['status'])
    expect(state).toMatchObject({ page: 1, pageSize: 25, order: 'asc', filters: {} })
    expect(activeFilterCount(parseList({ q: 'a', status: 'x' }, ['status']))).toBe(2)
  })

  it('exports CSV with quoting and no formulas', () => {
    const csv = toCsv([{ name: 'Smith, J', note: '=SUM(A1)', quote: 'say "hi"' }, { name: 'Ng', note: null, quote: '' }], [{ key: 'name', label: 'Name' }, { key: 'note', label: 'Note' }, { key: 'quote', label: 'Quote' }])
    expect(csv).toBe('Name,Note,Quote\r\n"Smith, J",\'=SUM(A1),"say ""hi"""\r\nNg,,\r\n')
  })
})

describe('a stale save (UI-13)', () => {
  it('merges what only one side changed and reports what both changed', () => {
    const base = { name: 'Hamlet', seats: 10, notes: '' }
    const merge = mergeConflict(base, { name: 'Hamlet 2', seats: 10, notes: 'mine' }, { name: 'Hamlet (renamed)', seats: 12, notes: '' })
    expect(merge.conflicts).toEqual(['name'])
    expect(merge.merged).toEqual({ name: 'Hamlet 2', seats: 12, notes: 'mine' })
  })

  it('is not a conflict when both made the same change', () => {
    expect(mergeConflict({ a: 1 }, { a: 2 }, { a: 2 }).conflicts).toEqual([])
  })

  it('recognises a conflict refusal by its code', () => {
    expect(isConflict('seats.performance.conflict')).toBe(true)
    expect(isConflict('core.access.signed-out')).toBe(false)
    expect(isConflict(undefined)).toBe(false)
  })
})

describe('setting controls (UI-14)', () => {
  it('writes durations the way people type them', () => {
    expect(durationText(1800)).toBe('30m')
    expect(durationText(86400 * 14)).toBe('2w')
    expect(durationText(90)).toBe('90s')
  })

  it('turns a stored value into a control value and back', () => {
    expect(toControl({ kind: 'duration', value: 900 })).toBe('15m')
    expect(toControl({ kind: 'money', value: 1250 })).toBe(12.5)
    expect(toControl({ kind: 'boolean', value: null })).toBe(false)
    expect(fromControl('money', 12.5)).toBe(1250)
    expect(fromControl('custom', '{"a":1}')).toEqual({ a: 1 })
    expect(fromControl('text', '', true)).toBeNull()
  })
  it('edits a rate as a count and a period, and a text custom value as text', () => {
    expect(toControl({ kind: 'rate', value: { count: 600, per: 60 } })).toEqual({ count: 600, per: '1m' })
    expect(toControl({ kind: 'rate', value: null })).toEqual({ count: undefined, per: '' })
    expect(fromControl('rate', { count: 20, per: ' 10m ' })).toEqual({ count: 20, per: '10m' })
    expect(fromControl('rate', { count: undefined, per: '' })).toEqual({ count: null, per: '' })
    const words = { on: 'on', off: 'off', rate: (count: number, per: string) => `${count} in ${per}` }
    expect(controlText('rate', { count: 10, per: '10m' }, words)).toBe('10 in 10m')
    expect(toControl({ kind: 'custom', value: '08-01' })).toBe('08-01')
    expect(fromControl('custom', '08-01', false, '08-01')).toBe('08-01')
    expect(fromControl('custom', '{"a":1}', false, { a: 0 })).toEqual({ a: 1 })
  })
})
