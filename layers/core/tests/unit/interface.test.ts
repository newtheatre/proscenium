// The pure parts of the interface: where an address belongs, the fixed order of console groups,
// the list's address query and CSV, the three-way merge of a stale save, and how settings become
// control values and back.
import { describe, expect, it } from 'vitest'
import { entryLabelKey, groupLabelKey, orderGroups, resolveEntry, shellOf } from '../../shared/navigation'
import { activeFilterCount, decodeList, defineList, directionWords, filterChipText, filterCount, parseList, serialiseList, toCsv } from '../../shared/list'
import { isConflict, mergeConflict } from '../../shared/form'
import { controlText, fromControl, toControl } from '../../shared/controls'

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
  const list = defineList('test.items', {
    filters: { status: { kind: 'choices', label: 'Status', options: [{ value: 'draft', label: 'Draft' }, { value: 'live', label: 'Live' }] }, when: { kind: 'dates', label: 'When', presets: [{ value: '7d', label: 'Last 7 days' }] }, listed: { kind: 'yes-no', label: 'Listed' } },
    sorts: { title: { label: 'Title', type: 'text' }, seats: { label: 'Seats', type: 'number' }, changed: { label: 'Last changed', type: 'date', natural: 'desc' } },
    columns: { title: { label: 'Title', sort: 'title', always: true }, seats: { label: 'Seats', sort: 'seats' } },
    views: { drafts: { label: 'Drafts', filters: { status: 'draft' }, sort: 'changed' }, all: { label: 'All' } },
    defaultView: 'all',
    defaultSort: { key: 'title', order: 'asc' },
  })

  it('reads and writes the same query, leaving out defaults', () => {
    const state = parseList({ q: 'ham', status: 'draft,live', sort: 'seats', order: 'desc', page: '2' }, list)
    expect(state).toMatchObject({ search: 'ham', filters: { status: 'draft,live' }, sort: 'seats', order: 'desc', page: 2, pageSize: 25, view: 'all' })
    expect(serialiseList(state, list)).toEqual({ q: 'ham', status: 'draft,live', sort: 'seats', order: 'desc', page: '2' })
    expect(serialiseList(parseList({}, list), list)).toEqual({})
    expect(serialiseList(parseList({ view: 'drafts' }, list), list)).toEqual({ view: 'drafts' })
  })

  it('ignores nonsense and filters that are not declared', () => {
    const state = parseList({ page: '-3', size: '7', other: 'x', order: 'sideways', sort: 'nope', view: 'nope' }, list)
    expect(state).toMatchObject({ page: 1, pageSize: 25, order: 'asc', filters: {}, sort: 'title', view: 'all' })
    expect(activeFilterCount(parseList({ q: 'a', status: 'x' }, list))).toBe(2)
    expect(filterCount(parseList({ q: 'a' }, list))).toBe(0)
  })

  it('refuses a declaration that uses a reserved key or an undeclared sort', () => {
    expect(() => defineList('t.bad', { filters: { page: { kind: 'choice', label: 'Page' } }, sorts: {}, columns: {} })).toThrow(/reserved/)
    expect(() => defineList('t.bad', { filters: {}, sorts: {}, columns: { a: { label: 'A', sort: 'x' } } })).toThrow(/undeclared sort/)
  })

  it('decodes strictly: a view sets filters and sort, the address overrides, an unknown key is named', () => {
    const can = (a: string) => a !== 'x'
    const ok = decodeList({ view: 'drafts', listed: 'yes' }, list, { can, today: '2026-11-16' })
    expect(ok).toMatchObject({ ok: true, value: { view: 'drafts', sort: { key: 'changed', order: 'desc' }, filters: { status: ['draft'], listed: true } } })
    expect(decodeList({ status: 'live', view: 'drafts' }, list, { today: '2026-11-16' })).toMatchObject({ ok: true, value: { filters: { status: ['live'] } } })
    expect(decodeList({ when: '7d' }, list, { today: '2026-11-16' })).toMatchObject({ ok: true, value: { filters: { when: { from: '2026-11-09', to: '2026-11-16' } } } })
    expect(decodeList({ colour: 'red' }, list, { today: '2026-11-16' })).toEqual({ ok: false, key: 'colour', reason: expect.any(String) })
    expect(decodeList({ status: 'gone' }, list, { today: '2026-11-16' })).toMatchObject({ ok: false, key: 'status' })
    expect(decodeList({ sort: 'x' }, list, { today: '2026-11-16' })).toMatchObject({ ok: false, key: 'sort' })
    expect(decodeList({ size: '30' }, list, { today: '2026-11-16' })).toMatchObject({ ok: false, key: 'size' })
    // The site's page size stands in when the address names none, and the address still wins.
    expect(decodeList({}, list, { today: '2026-11-16', defaultSize: 50 })).toMatchObject({ ok: true, value: { size: 50 } })
    expect(decodeList({ size: '100' }, list, { today: '2026-11-16', defaultSize: 50 })).toMatchObject({ ok: true, value: { size: 100 } })
    expect(serialiseList(parseList({}, list, 50), list, 50)).toEqual({})
    expect(serialiseList(parseList({ size: '25' }, list, 50), list, 50)).toEqual({ size: '25' })
  })

  it('drops a filter the viewer may not use, and words directions by type', () => {
    const guarded = defineList('t.g', { filters: { secret: { kind: 'choice', label: 'S', ability: 'x' } }, sorts: { a: { label: 'A', type: 'date' } }, columns: {} })
    expect(decodeList({ secret: 'v' }, guarded, { can: () => false, today: '2026-11-16' })).toMatchObject({ ok: true, value: { dropped: ['secret'], filters: {} } })
    expect(directionWords('date', 'asc').short).toBe('Soonest first')
    expect(directionWords('number', 'desc').short).toBe('Highest first')
  })

  it('writes a chip for each kind of filter', () => {
    expect(filterChipText(list.filters.status, 'draft,live')).toBe('Status: Draft, Live')
    expect(filterChipText(list.filters.when, '7d')).toBe('When: Last 7 days')
    expect(filterChipText(list.filters.when, '2026-11-01..2026-11-16')).toBe('When: 2026-11-01 to 2026-11-16')
    expect(filterChipText(list.filters.listed, 'no')).toBe('Listed: No')
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
  it('turns a stored value into a control value and back', () => {
    expect(toControl({ kind: 'duration', value: 900 })).toBe(900)
    expect(toControl({ kind: 'duration', value: null })).toBeNull()
    expect(fromControl('duration', null, true)).toBeNull()
    expect(toControl({ kind: 'money', value: 1250 })).toBe(1250)
    expect(toControl({ kind: 'boolean', value: null })).toBe(false)
    expect(fromControl('money', 1250)).toBe(1250)
    expect(fromControl('custom', '{"a":1}')).toEqual({ a: 1 })
    expect(fromControl('text', '', true)).toBeNull()
  })
  it('edits a rate as a count and a period, and a text custom value as text', () => {
    expect(toControl({ kind: 'rate', value: { count: 600, per: 60 } })).toEqual({ count: 600, per: 60 })
    expect(toControl({ kind: 'rate', value: null })).toEqual({ count: undefined, per: undefined })
    expect(fromControl('rate', { count: 20, per: 600 })).toEqual({ count: 20, per: 600 })
    expect(fromControl('rate', { count: undefined, per: undefined })).toEqual({ count: null, per: null })
    const words = { on: 'on', off: 'off', rate: (count: number, per: string) => `${count} in ${per}` }
    expect(controlText('rate', { count: 10, per: 600 }, words)).toBe('10 in 600')
    const spoken = { ...words, duration: (seconds: number) => `${seconds / 60} minutes`, money: (minor: number) => `£${minor / 100}` }
    expect(controlText('rate', { count: 10, per: 600 }, spoken)).toBe('10 in 10 minutes')
    expect(controlText('duration', 1800, spoken)).toBe('30 minutes')
    expect(controlText('money', 1250, spoken)).toBe('£12.5')
    expect(toControl({ kind: 'custom', value: '08-01' })).toBe('08-01')
    expect(fromControl('custom', '08-01', false, '08-01')).toBe('08-01')
    expect(fromControl('custom', '{"a":1}', false, { a: 0 })).toEqual({ a: 1 })
  })
})
