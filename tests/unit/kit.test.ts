// Unit tests for the kit's pure parts: ids, durations, settings, declarations and the clock.
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { text } from 'drizzle-orm/sqlite-core'
import { newId, isId, idTime, idSchema } from '#kit/ids'
import { parseDuration, formatDuration } from '#kit/duration'
import { setting, defineSettings, validateSettingValue, formatSetting } from '#kit/settings'
import { ability, defineAbilities } from '#kit/abilities'
import { code, defineModule, event, job, task } from '#kit/manifest'
import { col, defineTable } from '#kit/db'
import { latestSlot } from '#kit/jobs'
import { instantOfLocal } from '#kit/clock'
import { DeclarationError } from '#kit/refusal'

describe('ids', () => {
  it('are a prefix and 26 characters that sort by creation time', () => {
    const a = newId('ord', { at: Date.parse('2026-11-16T10:00:00Z') })
    const b = newId('ord', { at: Date.parse('2026-11-16T10:00:01Z') })
    expect(a).toMatch(/^ord_[2-7a-z]{26}$/)
    expect(a < b).toBe(true)
    expect(idTime(a)).toBe(Date.parse('2026-11-16T10:00:00Z'))
  })
  it('can be fully random', () => {
    expect(newId('tok', { random: true })).toMatch(/^tok_[2-7a-z]{26}$/)
  })
  it('are checked against their table\'s prefix', () => {
    const id = newId('ord')
    expect(isId('ord', id)).toBe(true)
    expect(isId('tkt', id)).toBe(false)
    expect(idSchema('tkt').safeParse(id).success).toBe(false)
  })
  it('refuse a bad prefix', () => {
    expect(() => newId('ORDER')).toThrow()
  })
})

describe('durations', () => {
  it('parse and format', () => {
    expect(parseDuration('30m')).toBe(1800)
    expect(parseDuration('14d')).toBe(1_209_600)
    expect(formatDuration(7200)).toBe('2 hours')
    expect(() => parseDuration('soon')).toThrow()
  })
})

describe('settings', () => {
  const entries = defineSettings('box-office', {
    'holds.length': setting.duration({ default: '15m', min: '5m', max: '1h', change: 'box-office.settings.manage' }),
    'orders.max-tickets': setting.integer({ default: 10, min: 1, max: 50, unit: 'box-office.units.tickets', change: 'box-office.settings.manage' }),
    'fees.booking': setting.money({ default: 150, min: 0, max: 1000, change: 'box-office.settings.manage', audience: 'public', quotable: true }),
  })

  it('are keyed by module', () => {
    expect(Object.keys(entries)).toEqual(['box-office.holds.length', 'box-office.orders.max-tickets', 'box-office.fees.booking'])
  })
  it('refuse a value outside the limits, naming the limit', () => {
    const result = validateSettingValue(entries['box-office.orders.max-tickets'], 51)
    expect(result.ok).toBe(false)
    expect(validateSettingValue(entries['box-office.holds.length'], '2h')).toMatchObject({ ok: false })
    expect(validateSettingValue(entries['box-office.holds.length'], '30m')).toEqual({ ok: true, value: 1800 })
  })
  it('format a quotable value for a page', () => {
    expect(formatSetting(entries['box-office.fees.booking'], 150, { currency: 'GBP' })).toBe('£1.50')
  })
  it('refuse a default outside the limits', () => {
    expect(() => defineSettings('x', { 'a.b': setting.integer({ default: 99, min: 1, max: 10, unit: 'x.u', change: 'x.settings.manage' }) })).toThrow(DeclarationError)
  })
  it('refuse a sensitive setting that is public', () => {
    expect(() => defineSettings('x', { 'a.b': setting.text({ default: '', maxLength: 10, change: 'x.settings.manage', sensitive: true, audience: 'public' }) })).toThrow(DeclarationError)
  })
})

describe('abilities', () => {
  it('make a privileged ability need a fresh, strong sign-in', () => {
    const declared = defineAbilities('finance', { 'refunds.issue': ability({ risk: 'privileged' }) })
    expect(declared['finance.refunds.issue']).toMatchObject({ assurance: 'strong', fresh: true })
  })
  it('refuse a privileged ability without freshness', () => {
    expect(() => defineAbilities('finance', { 'refunds.issue': ability({ risk: 'privileged', fresh: false }) })).toThrow(DeclarationError)
  })
  it('let a privileged ability that only reads, audited, skip freshness', () => {
    expect(() => defineAbilities('finance', { 'ledger.read': ability({ risk: 'privileged', fresh: false, audit: 'read' }) })).not.toThrow()
  })
})

describe('manifests', () => {
  const base = { id: 'lost-property', manifest: 1 as const, since: '0.1.0' }

  it('name the field that is wrong', () => {
    try {
      defineModule({ ...base, id: 'Lost Property' })
      expect.unreachable()
    }
    catch (error) {
      expect(error).toBeInstanceOf(DeclarationError)
      expect((error as DeclarationError).field).toBe('id')
    }
  })
  it('refuse an unknown field', () => {
    expect(() => defineModule({ ...base, colour: 'red' } as any)).toThrow(/colour/)
  })
  it('refuse a person\'s words in an event payload', () => {
    expect(() => defineModule({ ...base, events: { announces: { 'lost-property.item.found': event({ version: 1, payload: z.object({ description: z.string() }) }) } } })).toThrow(/description/)
    expect(() => defineModule({ ...base, events: { announces: { 'lost-property.item.found': event({ version: 1, payload: z.object({ itemId: z.string(), kind: code(), count: z.number() }) }) } } })).not.toThrow()
  })
  it('refuse a badly named job or task', () => {
    expect(() => defineModule({ ...base, jobs: { 'lost-property.Sweep': job({ payload: z.object({}) }) } })).toThrow(DeclarationError)
    expect(() => defineModule({ ...base, tasks: { 'lost-property.clear-items': task({ dailyAt: '25:00' }) } })).toThrow(/dailyAt/)
  })
})

describe('tables', () => {
  it('refuse a column with no data class, naming it', () => {
    expect(() => defineTable('lost_property_items', { id: col.id(), description: text('description') } as any, { id: 'lpi', realm: 'operational' })).toThrow(/description/)
  })
  it('refuse personal data that no subject or retention reaches', () => {
    expect(() => defineTable('lost_property_items', { id: col.id(), finder: col.personal(text('finder')) }, { id: 'lpi', realm: 'operational' })).toThrow(DeclarationError)
  })
  it('refuse a bad prefix', () => {
    expect(() => defineTable('lost_property_items', { id: col.id() }, { id: 'LOST', realm: 'operational' })).toThrow(DeclarationError)
  })
})

describe('task slots', () => {
  const zone = 'Europe/London'
  it('are the latest slot at or before now, in local time', () => {
    expect(latestSlot({ dailyAt: '04:00' }, Date.parse('2026-11-16T12:00:00Z'), zone)).toBe(Date.parse('2026-11-16T04:00:00Z'))
    expect(latestSlot({ dailyAt: '04:00' }, Date.parse('2026-11-16T03:00:00Z'), zone)).toBe(Date.parse('2026-11-15T04:00:00Z'))
    expect(latestSlot({ dailyAt: '04:00' }, Date.parse('2026-07-16T12:00:00Z'), zone)).toBe(Date.parse('2026-07-16T03:00:00Z'))
  })
  it('handle every and weekly', () => {
    expect(latestSlot({ every: '5m' }, Date.parse('2026-11-16T12:07:30Z'), zone)).toBe(Date.parse('2026-11-16T12:05:00Z'))
    expect(latestSlot({ weeklyOn: { day: 'monday', at: '09:00' } }, Date.parse('2026-11-18T12:00:00Z'), zone)).toBe(Date.parse('2026-11-16T09:00:00Z'))
  })
  it('move a time in the spring gap to the first minute after it', () => {
    expect(instantOfLocal('2027-03-28', '01:30', zone)).toBe(Date.parse('2027-03-28T01:00:00Z'))
  })
  it('take the earlier of a repeated autumn time', () => {
    expect(instantOfLocal('2026-10-25', '01:30', zone)).toBe(Date.parse('2026-10-25T00:30:00Z'))
  })
})
