// Figures (core.measure): what defineMeasure and the registry refuse, and what counts as a bad answer.
import { describe, expect, it } from 'vitest'
import { ability, defineAbilities } from '#kit/abilities'
import { defineModule, point } from '#kit/manifest'
import { defineMeasure, isBreakdown, type Measure } from '#kit/measures'
import { buildRegistry, type ModuleEntry } from '#kit/registry'
import { badAnswer } from '../../layers/core/server/measures/service'

const read = async () => ({ rows: [] })
const sold = (extra: Partial<Measure> = {}): Measure => ({ label: 'bar.measures.sold', unit: 'count', combine: 'sum', by: ['performance'], ability: 'bar.figures.view', read, ...extra })

describe('declaring a figure', () => {
  it('takes shared breakdowns and a module\'s own <module>.<noun>, and nothing else', () => {
    expect(isBreakdown('committee-year')).toBe(true)
    expect(isBreakdown('bar.product')).toBe(true)
    expect(isBreakdown('product')).toBe(false)
  })
  it('refuses a figure with no read that is not a ratio, and a ratio with one', () => {
    expect(() => defineMeasure(sold({ read: undefined }))).toThrow(/read/)
    expect(() => defineMeasure(sold({ unit: 'percent', ratio: { of: 'bar.a', over: 'bar.b' } }))).toThrow(/no read/)
  })
  it('refuses a ratio that is not a percent, an unknown unit and an unknown key', () => {
    expect(() => defineMeasure(sold({ read: undefined, ratio: { of: 'bar.a', over: 'bar.b' } }))).toThrow(/percent/)
    expect(() => defineMeasure(sold({ unit: 'pounds' as never }))).toThrow(/unit/)
    expect(() => defineMeasure(sold({ by: ['product' as never] }))).toThrow(/product/)
  })
})

describe('the registry\'s figures', () => {
  const core = { manifest: defineModule({ id: 'core', manifest: 1, since: '0.1.0', points: { 'core.measure': point({ kind: 'code', contract: 'measure' }) } } as any), root: 'layers/core', owner: 'upstream', handlers: {} } as unknown as ModuleEntry
  const bar = (figures: Record<string, Measure>, abilities = { 'figures.view': ability() }) => ({
    manifest: defineModule({ id: 'bar', manifest: 1, since: '0.1.0', abilities: defineAbilities('bar', abilities), contributes: { 'core.measure': Object.keys(figures).map(id => ({ id, file: id.split('.').pop() })) } } as any),
    root: 'layers/bar',
    owner: 'upstream',
    handlers: { contributions: { 'core.measure': Object.fromEntries(Object.entries(figures).map(([id, m]) => [id.split('.').pop(), m])) } },
  }) as unknown as ModuleEntry

  it('accepts a figure named under its module, with a declared ability, and a ratio of two of them', () => {
    expect(() => buildRegistry([core, bar({ 'bar.sold': sold(), 'bar.stock': sold(), 'bar.sell-through': sold({ unit: 'percent', read: undefined, ratio: { of: 'bar.sold', over: 'bar.stock' } }) })])).not.toThrow()
  })
  it('refuses a figure not named under its module', () => {
    expect(() => buildRegistry([core, bar({ sold: sold() })])).toThrow(/bar\.<figure>/)
  })
  it('refuses an ability nobody declares', () => {
    expect(() => buildRegistry([core, bar({ 'bar.sold': sold({ ability: 'bar.figures.see' }) })])).toThrow(/not a declared ability/)
  })
  it('refuses another module\'s own key', () => {
    expect(() => buildRegistry([core, bar({ 'bar.sold': sold({ by: ['box-office.band'] }) })])).toThrow(/another module's key/)
  })
  it('refuses a ratio of a figure that does not exist, or that does not break down as the ratio does', () => {
    expect(() => buildRegistry([core, bar({ 'bar.sold': sold(), 'bar.fill': sold({ unit: 'percent', read: undefined, ratio: { of: 'bar.sold', over: 'bar.stock' } }) })])).toThrow(/not a declared figure/)
    expect(() => buildRegistry([core, bar({ 'bar.sold': sold({ by: ['day'] }), 'bar.stock': sold({ by: ['day'] }), 'bar.fill': sold({ unit: 'percent', read: undefined, by: ['performance'], ratio: { of: 'bar.sold', over: 'bar.stock' } }) })])).toThrow(/every key/)
  })
})

describe('a bad answer', () => {
  const count = { unit: 'count' as const }
  const money = { unit: 'money' as const }
  it('is none of keys asked, a number and, for money, a currency', () => {
    expect(badAnswer(count, { by: ['day'] }, { rows: [{ keys: { day: '2026-11-24' }, value: 3 }] })).toBeNull()
    expect(badAnswer(money, { by: [] }, { rows: [{ keys: {}, value: 1250, currency: 'GBP' }] })).toBeNull()
  })
  it('is a key not asked for, an account id, a name or anything beside keys, value and currency', () => {
    expect(badAnswer(count, { by: ['day'] }, { rows: [{ keys: { performance: 'perf_1' }, value: 1 }] })).toBe('key-not-asked')
    expect(badAnswer(count, { by: ['performance'] }, { rows: [{ keys: { performance: 'acc_abc' }, value: 1 }] })).toBe('key-value')
    expect(badAnswer(count, { by: [] }, { rows: [{ keys: {}, value: 1, name: 'Ada' }] })).toBe('row-extra-field')
  })
  it('is a value that is not a finite number, money without a currency, or a count with one', () => {
    expect(badAnswer(count, { by: [] }, { rows: [{ keys: {}, value: '3' }] })).toBe('value-not-number')
    expect(badAnswer(count, { by: [] }, { rows: [{ keys: {}, value: Number.NaN }] })).toBe('value-not-number')
    expect(badAnswer(money, { by: [] }, { rows: [{ keys: {}, value: 1 }] })).toBe('currency')
    expect(badAnswer(count, { by: [] }, { rows: [{ keys: {}, value: 1, currency: 'GBP' }] })).toBe('currency')
    expect(badAnswer(count, { by: [] }, {})).toBe('no-rows')
  })
})
