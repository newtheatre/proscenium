// Unit tests for the kit's pure parts: ids, durations, settings, declarations and the clock.
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { text } from 'drizzle-orm/sqlite-core'
import { newId, isId, idTime, idSchema } from '#kit/ids'
import { parseDuration, formatDuration, unitsWithin, durationParts } from '#kit/duration'
import { setting, defineSettings, validateSettingValue, formatSetting, optionsOf } from '#kit/settings'
import { catalogueLabel, searchable } from '../../layers/core/shared/choices'
import { ability, defineAbilities, record, defineRecords } from '#kit/abilities'
import { code, defineModule, event, job, task } from '#kit/manifest'
import { appendOnlyTriggers, col, columnMeta, defineTable, tableMeta, withoutRowidSql } from '#kit/db'
import { latestSlot } from '#kit/jobs'
import { resolveOn } from '#kit/modules-store'
import { instantOfLocal } from '#kit/clock'
import { DeclarationError } from '#kit/refusal'
import { buildRegistry, installRegistry, type ModuleEntry } from '#kit/registry'
import { withImplied } from '../../layers/core/server/identity/grants'
import { points as corePoints } from '../../layers/core/module/points'
import { points as domainPoints } from '../../layers/core/module/domain'

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
  it('count a month as 30 days and a year as 365, and read a value in the largest unit that divides it', () => {
    expect(parseDuration('6mo')).toBe(180 * 86_400)
    expect(parseDuration('7y')).toBe(2555 * 86_400)
    expect(formatDuration(2555 * 86_400)).toBe('7 years')
    expect(formatDuration(30 * 86_400)).toBe('1 month')
    expect(formatDuration(400 * 86_400)).toBe('400 days')
    expect(formatDuration(0)).toBe('0 minutes')
  })
  it('offer only units that can hold a value inside the limits', () => {
    expect(unitsWithin(parseDuration('5m'), parseDuration('1h'))).toEqual(['hour', 'minute', 'second'])
    expect(unitsWithin(parseDuration('365d'), parseDuration('3650d'))).toEqual(['year', 'month', 'week', 'day', 'hour', 'minute', 'second'])
    expect(unitsWithin(parseDuration('1d'), parseDuration('30d'))).toEqual(['month', 'week', 'day', 'hour', 'minute', 'second'])
    expect(unitsWithin(parseDuration('90m'), parseDuration('100m'))).toEqual(['minute', 'second'])
  })
  it('show a stored value in the largest offered unit that divides it', () => {
    const offered = unitsWithin(parseDuration('5m'), parseDuration('1h'))
    expect(durationParts(1800, offered)).toEqual({ count: 30, unit: 'minute' })
    expect(durationParts(3600, offered)).toEqual({ count: 1, unit: 'hour' })
    expect(durationParts(parseDuration('2555d'))).toEqual({ count: 7, unit: 'year' })
    expect(durationParts(0, offered)).toEqual({ count: 0, unit: 'hour' })
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
  it('take a duration\'s units, which must be units of time', () => {
    expect(defineSettings('core', { 'a.b': setting.duration({ default: '7d', units: ['week', 'day'], change: 'c' }) })['core.a.b']).toMatchObject({ units: ['week', 'day'] })
    expect(() => defineSettings('core', { 'a.b': setting.duration({ default: '7d', units: ['fortnight'], change: 'c' } as never) })).toThrow(DeclarationError)
    expect(() => defineSettings('core', { 'a.b': setting.duration({ default: '7d', units: [], change: 'c' }) })).toThrow(DeclarationError)
  })
  it('take a choice from one of the kit\'s catalogues, checked against it', () => {
    const local = defineSettings('core', {
      'locale.time-zone': setting.choice({ unset: true, catalogue: 'time-zone', change: 'core.settings.manage' }),
      'locale.currency': setting.choice({ default: 'GBP', catalogue: 'currency', change: 'core.settings.manage' }),
      'locale.language': setting.choice({ default: 'en-GB', catalogue: 'language', change: 'core.settings.manage' }),
      'organisation.country': setting.choice({ default: 'GB', catalogue: 'country', change: 'core.settings.manage' }),
    })
    expect(validateSettingValue(local['core.locale.time-zone'], 'Europe/London')).toEqual({ ok: true, value: 'Europe/London' })
    expect(validateSettingValue(local['core.locale.time-zone'], 'UTC')).toMatchObject({ ok: true })
    expect(validateSettingValue(local['core.locale.time-zone'], 'Mars/Olympus')).toMatchObject({ ok: false, limit: 'options' })
    expect(validateSettingValue(local['core.locale.currency'], 'EUR')).toMatchObject({ ok: true })
    expect(validateSettingValue(local['core.locale.currency'], 'gbp')).toMatchObject({ ok: false })
    expect(validateSettingValue(local['core.locale.language'], 'fr-FR')).toMatchObject({ ok: false })
    expect(optionsOf(local['core.locale.language'])).toEqual(['en-GB'])
    expect(validateSettingValue(local['core.organisation.country'], 'XK')).toMatchObject({ ok: false })
    expect(optionsOf(local['core.organisation.country'])).toHaveLength(249)
  })
  it('refuse a choice with both options and a catalogue, an unknown catalogue, or a catalogue on text', () => {
    expect(() => defineSettings('core', { 'a.b': setting.choice({ default: 'x', options: ['x'], catalogue: 'currency', change: 'c' } as never) })).toThrow(DeclarationError)
    expect(() => defineSettings('core', { 'a.b': setting.choice({ default: 'x', catalogue: 'planets', change: 'c' } as never) })).toThrow(DeclarationError)
    expect(() => defineSettings('core', { 'a.b': setting.text({ default: 'x', maxLength: 3, catalogue: 'currency', change: 'c' } as never) })).toThrow(DeclarationError)
  })
  it('let only a list of text name a route of values to pick from', () => {
    expect(() => defineSettings('core', { 'a.b': setting.list({ default: [], of: 'text', choices: '/api/core/policies/choices', change: 'c' }) })).not.toThrow()
    expect(() => defineSettings('core', { 'a.b': setting.text({ default: '', maxLength: 3, choices: '/api/x', change: 'c' } as never) })).toThrow(DeclarationError)
    expect(() => defineSettings('core', { 'a.b': setting.list({ default: [], of: 'text', choices: 'policies', change: 'c' }) })).toThrow(DeclarationError)
  })
  it('draw a long choice with a search box and label catalogue values by name', () => {
    expect(searchable(['system', 'light', 'dark'])).toBe(false)
    expect(searchable(optionsOf(setting.choice({ default: 'GBP', catalogue: 'currency', change: 'c' })))).toBe(true)
    expect(catalogueLabel('currency', 'GBP', 'en-GB')).toBe('GBP: British Pound')
    expect(catalogueLabel('country', 'GB', 'en-GB')).toBe('United Kingdom')
    expect(catalogueLabel('language', 'en-GB', 'en-GB')).toBe('British English')
    expect(catalogueLabel('time-zone', 'Europe/London', 'en-GB', new Date('2026-07-01T12:00:00Z'))).toBe('Europe/London (GMT+1)')
    expect(catalogueLabel('time-zone', 'America/New_York', 'en-GB', new Date('2026-01-01T12:00:00Z'))).toBe('America/New York (GMT-5)')
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
  it('keep a time within its limits', () => {
    const { 'x.day.start': start } = defineSettings('x', { 'day.start': setting.time({ default: '04:00', min: '00:00', max: '08:00', change: 'x.settings.manage' }) })
    expect(validateSettingValue(start, '07:59')).toEqual({ ok: true, value: '07:59' })
    expect(validateSettingValue(start, '08:01')).toMatchObject({ ok: false, limit: 'max' })
    expect(() => defineSettings('x', { 'a.b': setting.time({ default: '04:00', max: '8am', change: 'x.settings.manage' }) })).toThrow(DeclarationError)
  })
  it('refuse text shorter than its least length', () => {
    const { 'x.site.name': name } = defineSettings('x', { 'site.name': setting.text({ unset: true, minLength: 1, maxLength: 80, change: 'x.settings.manage' }) })
    expect(validateSettingValue(name, '')).toMatchObject({ ok: false, limit: 'minLength' })
    expect(validateSettingValue(name, null)).toEqual({ ok: true, value: null })
  })
  it('keep the lines of a multiline text, and allow multiline only on text', () => {
    const { 'x.mail.footer': footer } = defineSettings('x', { 'mail.footer': setting.text({ unset: true, maxLength: 200, multiline: true, change: 'x.settings.manage' }) })
    expect(validateSettingValue(footer, 'One Street\nTown')).toEqual({ ok: true, value: 'One Street\nTown' })
    expect(() => defineSettings('x', { 'a.b': { ...setting.integer({ default: 1, change: 'x.settings.manage' }), multiline: true } as never })).toThrow(DeclarationError)
  })
  it('read a rate as a count in a period', () => {
    const { 'x.limits.sign-in': rate } = defineSettings('x', { 'limits.sign-in': setting.rate({ default: { count: 10, per: '10m' }, change: 'x.settings.manage' }) })
    expect(validateSettingValue(rate, { count: 10, per: '10m' })).toEqual({ ok: true, value: { count: 10, per: 600 } })
    expect(validateSettingValue(rate, { count: 10, per: '2d' })).toMatchObject({ ok: false, limit: 'per' })
    expect(validateSettingValue(rate, { count: 0, per: '1m' })).toMatchObject({ ok: false, limit: 'count' })
    expect(formatSetting(rate, { count: 10, per: 600 })).toBe('10 in 10 minutes')
  })
  it('refuse an unknown onChange', () => {
    expect(() => defineSettings('x', { 'a.b': setting.integer({ default: 1, change: 'x.settings.manage', onChange: 'shout' as 'reason' }) })).toThrow(DeclarationError)
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
  it('refuse an impliable ability that is privileged or on a record type', () => {
    expect(() => defineAbilities('finance', { 'ledger.read': ability({ risk: 'privileged', impliable: true }) })).toThrow(/risk normal/)
    expect(() => defineAbilities('finance', { 'ledger.read': ability({ on: 'finance.ledger', impliable: true }) })).toThrow(/record type/)
  })
  it('name the module\'s own abilities by short name, and leave another module\'s to the registry', () => {
    expect(() => defineAbilities('finance', { 'ledger.read': ability({ implies: ['ledger.list'] }) })).toThrow(/not an ability of finance/)
    expect(() => defineAbilities('finance', { 'ledger.list': ability(), 'ledger.read': ability({ implies: ['finance.ledger.list'] }) })).toThrow(/short name/)
    expect(() => defineAbilities('finance', { 'ledger.read': ability({ implies: ['core.account.find'] }) })).not.toThrow()
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
  it('take signing purposes under the module\'s own id, each once, with periods of at least a day (F-37)', () => {
    expect(() => defineModule({ ...base, signing: [{ purpose: 'lost-property.claim-code', rotateEvery: '90d', keepFor: '365d' }] })).not.toThrow()
    expect(() => defineModule({ ...base, signing: [{ purpose: 'box-office.door-code', rotateEvery: '90d', keepFor: '365d' }] })).toThrow(/signing\[0\]\.purpose/)
    expect(() => defineModule({ ...base, signing: [{ purpose: 'lost-property.claim-code', rotateEvery: '90d', keepFor: '365d' }, { purpose: 'lost-property.claim-code', rotateEvery: '30d', keepFor: '60d' }] })).toThrow(/listed twice/)
    expect(() => defineModule({ ...base, signing: [{ purpose: 'lost-property.claim-code', rotateEvery: '1h', keepFor: '365d' }] })).toThrow(/rotateEvery/)
    expect(() => defineModule({ ...base, signing: [{ purpose: 'lost-property.claim-code', rotateEvery: '90d', keepFor: 'for ever' }] })).toThrow(/keepFor/)
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
  it('refuse a subject column that may be empty unless it says who reaches the unlinked rows', () => {
    const columns = () => ({ id: col.id(), accountId: col.account('account_id', { role: 'subject', onMerge: 'move', reason: 'a test', nullable: true }), name: col.personal(text('name')) })
    expect(() => defineTable('lost_property_claims', columns(), { id: 'lpc', realm: 'audience' })).toThrow(/unlinked: 'staff'/)
    expect(() => defineTable('lost_property_claims', columns(), { id: 'lpc', realm: 'audience', subject: { account: 'account_id', unlinked: 'staff' } })).not.toThrow()
  })
  it('treat an account column as alias unless it says otherwise, and want a one-line reason for a move', () => {
    expect(columnMeta(col.account('account_id', { role: 'subject' }))?.account?.onMerge).toBe('alias')
    expect(() => col.account('account_id', { role: 'subject', onMerge: 'move' })).toThrow(/one-line reason/)
    expect(() => col.account('account_id', { role: 'subject', onMerge: 'move', reason: 'two\nlines' })).toThrow(/one-line reason/)
    expect(columnMeta(col.account('account_id', { role: 'subject', onMerge: 'move', reason: 'signing in finds the account by it' }))?.account?.reason).toBe('signing in finds the account by it')
    expect(() => col.account('account_id', { role: 'subject', reason: 'not a move' })).toThrow(/only for onMerge: 'move'/)
  })
  it('keep an actor column as alias', () => {
    expect(() => defineTable('lost_property_handlings', { id: col.id(), handledBy: col.account('handled_by', { role: 'actor', onMerge: 'move', reason: 'no' }) }, { id: 'lph', realm: 'operational' })).toThrow(/actor column/)
  })
  it('take the realms audience, members, operational and system', () => {
    expect(() => defineTable('lost_property_bins', { id: col.id() }, { id: 'lpb', realm: 'system' })).not.toThrow()
    expect(() => defineTable('lost_property_bins', { id: col.id() }, { id: 'lpb', realm: 'member' as 'members' })).toThrow(/realm/)
  })
  it('keep no times in a table declared timestamps: false (R3-23)', () => {
    const ballot = () => ({ id: col.id(), choice: col.internal(text('choice')) })
    expect(() => defineTable('lost_property_votes', ballot(), { id: 'lpv', realm: 'members', subject: 'none', random: true, timestamps: false })).not.toThrow()
    expect(() => defineTable('lost_property_votes', { ...ballot(), at: col.createdAt() }, { id: 'lpv', realm: 'members', subject: 'none', random: true, timestamps: false })).toThrow(/lost_property_votes\.at.*keeps no times/)
    expect(() => defineTable('lost_property_votes', { ...ballot(), changed: col.updatedAt() }, { id: 'lpv', realm: 'members', subject: 'none', random: true, timestamps: false })).toThrow(/keeps no times/)
    expect(() => defineTable('lost_property_votes', { ...ballot(), cast: col.timestamp('cast_at') }, { id: 'lpv', realm: 'members', subject: 'none', random: true, timestamps: false })).toThrow(/keeps no times/)
    expect(() => defineTable('lost_property_votes', { ...ballot(), day: col.localDate('day') }, { id: 'lpv', realm: 'members', subject: 'none', random: true, timestamps: false })).toThrow(/keeps no times/)
  })
  it('want random ids and no retention in a table that keeps no times, since either would date its rows', () => {
    const ballot = () => ({ id: col.id(), choice: col.internal(text('choice')) })
    expect(() => defineTable('lost_property_votes', ballot(), { id: 'lpv', realm: 'members', subject: 'none', timestamps: false })).toThrow(/random: true/)
    expect(() => defineTable('lost_property_votes', ballot(), { id: 'lpv', realm: 'members', subject: 'none', random: true, timestamps: false, retention: { fixed: '30d' } })).toThrow(/retention/)
    expect(() => defineTable('lost_property_votes', ballot(), { id: 'lpv', realm: 'members', subject: 'none', random: true, timestamps: true as false })).toThrow(/timestamps/)
  })
  it('make a table WITHOUT ROWID only when it has a primary key and is not searched (R3-23)', () => {
    expect(() => defineTable('lost_property_votes', { id: col.id() }, { id: 'lpv', realm: 'members', subject: 'none', random: true, withoutRowid: true })).not.toThrow()
    expect(() => defineTable('lost_property_tallies', { choice: col.internal(text('choice')) }, { realm: 'members', subject: 'none', withoutRowid: true })).toThrow(/primary key/)
    expect(() => defineTable('lost_property_votes', { id: col.id() }, { id: 'lpv', realm: 'members', subject: 'none', withoutRowid: 'yes' as unknown as true })).toThrow(/withoutRowid/)
  })
  it('add WITHOUT ROWID to the statements that make such a table, and to a rebuild of it', () => {
    const sql = 'CREATE TABLE `lost_property_votes` (\n\t`id` text PRIMARY KEY\n);\n--> statement-breakpoint\nCREATE TABLE `lost_property_bins` (\n\t`id` text PRIMARY KEY\n);\n--> statement-breakpoint\nCREATE TABLE `__new_lost_property_votes` (\n\t`id` text PRIMARY KEY,\n\t`x` text\n);\n'
    const out = withoutRowidSql(sql, ['lost_property_votes'])
    expect(out).toContain('CREATE TABLE `lost_property_votes` (\n\t`id` text PRIMARY KEY\n) WITHOUT ROWID;')
    expect(out).toContain('CREATE TABLE `__new_lost_property_votes` (\n\t`id` text PRIMARY KEY,\n\t`x` text\n) WITHOUT ROWID;')
    expect(out).toContain('CREATE TABLE `lost_property_bins` (\n\t`id` text PRIMARY KEY\n);')
    expect(withoutRowidSql(out, ['lost_property_votes'])).toBe(out)
  })
  it('let an append-only table name the columns that may still change, and refuse one it does not have', () => {
    const columns = () => ({ id: col.id(), state: col.internal(text('state')), terms: col.internal(text('terms')) })
    const versions = defineTable('lost_property_terms', columns(), { id: 'lpt', realm: 'operational', subject: 'none', appendOnly: { except: ['state'] } })
    const update = appendOnlyTriggers(tableMeta(versions)!).find(t => t.name.endsWith('_update'))!.sql
    expect(update).toContain('NEW.`terms` IS OLD.`terms`')
    expect(update).not.toContain('`state`')
    expect(() => defineTable('lost_property_terms', columns(), { id: 'lpt', realm: 'operational', subject: 'none', appendOnly: { except: ['status'] } })).toThrow(/"status" in except/)
  })
  it('mark a column to be sealed with the core key', () => {
    expect(columnMeta(col.internal(text('secret'), { encrypted: true }))?.encrypted).toBe(true)
    expect(columnMeta(col.special('needs'))?.encrypted).toBe(true)
  })
})

describe('where settings are shown', () => {
  const lost = (extra: object) => ({ manifest: defineModule({ id: 'lost-property', manifest: 1, since: '0.1.0', settings: defineSettings('lost-property', {
    'items.keep-for': setting.duration({ default: '30d', change: 'lost-property.items.manage' }),
    'items.notice': setting.text({ default: 'Ask at the desk', maxLength: 80, change: 'lost-property.items.manage' }),
    'shelves.count': setting.integer({ default: 3, change: 'lost-property.items.manage' }),
  }), abilities: defineAbilities('lost-property', { 'items.manage': ability() }), ...extra } as any), root: 'layers/lost-property', owner: 'upstream', handlers: {} }) as unknown as ModuleEntry

  it('refuse scope, naming settingGroups', () => {
    expect(() => defineSettings('x', { 'a.b': { ...setting.boolean({ default: true, change: 'x.settings.manage' }), scope: 'site' } as any })).toThrow(/settingGroups/)
  })
  it('put a group with no declaration on the module\'s own page in Admin, and refuse one placed in the console', () => {
    const registry = buildRegistry([lost({})])
    expect(registry.settingHomes.get('lost-property.items.keep-for')).toEqual({ page: 'lost-property.admin' })
    expect(registry.settingPages.get('lost-property.admin')).toMatchObject({ place: 'admin', group: 'modules', to: '/admin/modules/lost-property' })
    expect(() => lost({ settingGroups: { items: { place: 'console' as never } } })).toThrow(/no page of settings is made in the console/)
    expect(() => lost({ settingPages: { desk: { place: 'console' as never, group: 'modules' } } })).toThrow(/no page of settings is made in the console/)
  })
  it('keep About for the module\'s page', () => {
    expect(() => buildRegistry([lost({ settingPages: { about: { place: 'admin', group: 'modules' } } })])).toThrow(/the platform makes itself/)
  })
  it('give every setting one home: a declared page, Advanced, a screen, or a setting\'s own screen', () => {
    const registry = buildRegistry([lost({
      settingPages: { desk: { place: 'admin', group: 'modules' } },
      settingGroups: { items: { page: 'desk' }, shelves: { advanced: true } },
    })])
    expect(registry.settingHomes.get('lost-property.items.notice')).toEqual({ page: 'lost-property.desk' })
    expect(registry.settingPages.get('lost-property.desk')!.to).toBe('/admin/modules/lost-property/desk')
    expect(registry.settingHomes.get('lost-property.shelves.count')).toEqual({ page: 'core.advanced' })
    const screened = buildRegistry([lost({ settingGroups: { items: { screen: '/console/lost-property/desk' } } })])
    expect(screened.settingHomes.get('lost-property.items.notice')).toEqual({ screen: '/console/lost-property/desk' })
  })
  it('refuse a group with two homes, a page of another module, an undeclared group, or a page the platform makes', () => {
    expect(() => lost({ settingPages: { desk: { place: 'admin', group: 'modules' } }, settingGroups: { items: { page: 'desk', advanced: true } } })).toThrow(/one home/)
    expect(() => lost({ settingGroups: { items: { page: 'theatre' } } })).toThrow(/not one of lost-property's settingPages/)
    expect(() => lost({ settingGroups: { raffle: { advanced: true } } })).toThrow(/declares no setting in this group/)
    expect(() => buildRegistry([lost({ settingPages: { settings: { place: 'admin', group: 'modules' } } })])).toThrow(/the platform makes itself/)
  })
  it('want every group of core to name its home', () => {
    expect(() => defineModule({ id: 'core', manifest: 1, since: '0.1.0', settings: defineSettings('core', { 'odd.one': setting.boolean({ default: true, change: 'core.settings.manage' }) }) } as any)).toThrow(/core has no settings page of its own/)
  })
  it('make a setting a table keeps its rows by confirm, unless it already asks for a reason', () => {
    const items = defineTable('lost_property_items', { id: col.id(), at: col.createdAt() }, { id: 'lpi', realm: 'system', subject: 'none', retention: 'lost-property.items.keep-for' })
    const registry = buildRegistry([lost({ tables: { items } })])
    expect(registry.settings.get('lost-property.items.keep-for')!.entry.onChange).toBe('confirm')
    expect(registry.settings.get('lost-property.shelves.count')!.entry.onChange).toBeUndefined()
    const strict = lost({ tables: { items }, settings: defineSettings('lost-property', { 'items.keep-for': setting.duration({ default: '30d', change: 'lost-property.items.manage', onChange: 'reason' }) }) })
    expect(buildRegistry([strict]).settings.get('lost-property.items.keep-for')!.entry.onChange).toBe('reason')
  })
  it('carry a renamed key, and refuse an old key that is still declared', () => {
    const renamed = lost({ settings: defineSettings('lost-property', { 'items.kept-for': setting.duration({ default: '30d', change: 'lost-property.items.manage', replaces: 'lost-property.items.keep-for' }) }) })
    expect(buildRegistry([renamed]).settingAliases.get('lost-property.items.keep-for')).toBe('lost-property.items.kept-for')
    const both = lost({ settings: defineSettings('lost-property', {
      'items.keep-for': setting.duration({ default: '30d', change: 'lost-property.items.manage' }),
      'items.kept-for': setting.duration({ default: '30d', change: 'lost-property.items.manage', replaces: 'lost-property.items.keep-for' }),
    }) })
    expect(() => buildRegistry([both])).toThrow(/still declared/)
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

describe('the registry', () => {
  const entry = (manifest: object): ModuleEntry => ({ manifest: defineModule({ manifest: 1, since: '0.1.0', ...manifest } as any), root: `layers/${(manifest as any).id}`, owner: 'upstream', handlers: {} } as unknown as ModuleEntry)

  it('gives core\'s deliverable listener every event not marked internal', () => {
    const core = { ...entry({ id: 'core', switchable: false, events: { listens: { deliverable: 'deliver-webhooks' } } }), root: 'layers/core', handlers: { listeners: { 'deliver-webhooks': () => {} } } } as ModuleEntry
    const lost = entry({ id: 'lost-property', events: { announces: {
      'lost-property.item.found': event({ version: 1, payload: z.object({ itemId: z.string() }) }),
      'lost-property.item.tidied': event({ version: 1, payload: z.object({ itemId: z.string() }), internal: true }),
    } } })
    const registry = buildRegistry([core, lost])
    expect(registry.listeners.get('lost-property.item.found')).toEqual([{ module: 'core', listener: 'deliver-webhooks', deliverable: true }])
    expect(registry.listeners.get('lost-property.item.tidied')).toBeUndefined()
  })
  it('lets only core listen on deliverable', () => {
    expect(() => defineModule({ id: 'lost-property', manifest: 1, since: '0.1.0', events: { listens: { deliverable: 'send-everything' } } })).toThrow(/only core/)
  })
  it('lets uses name a reserved module that is not written yet, and nothing else', () => {
    expect(() => buildRegistry([entry({ id: 'lost-property', uses: ['bar'] })])).not.toThrow()
    expect(() => buildRegistry([entry({ id: 'lost-property', uses: ['raffle'] })])).toThrow(/reserved/)
  })
  describe('lets an ability imply another module\'s', () => {
    const core = (impliable?: boolean, risk: 'normal' | 'privileged' = 'normal') => ({ ...entry({ id: 'core', switchable: false, abilities: defineAbilities('core', { 'account.find': { ...ability(), risk, impliable } }) }), root: 'layers/core' }) as ModuleEntry
    const desk = (implies: string, link: object = {}) => entry({ id: 'lost-property', ...link, abilities: defineAbilities('lost-property', { 'item.return': ability({ implies: [implies] }) }) })
    it('when it is core\'s, impliable and of risk normal', () => {
      const registry = buildRegistry([core(true), desk('core.account.find')])
      expect(registry.abilities.get('lost-property.item.return')!.decl.implies).toEqual(['core.account.find'])
      installRegistry(registry)
      expect(withImplied(['lost-property.item.return'])).toEqual(['core.account.find', 'lost-property.item.return'])
    })
    it('and refuses one that is not impliable, or privileged', () => {
      expect(() => buildRegistry([core(), desk('core.account.find')])).toThrow(/impliable: true/)
      expect(() => buildRegistry([core(true, 'privileged'), desk('core.account.find')])).toThrow(/risk normal/)
    })
    it('and refuses one that does not exist', () => {
      expect(() => buildRegistry([core(true), desk('core.account.lose')])).toThrow(/not a declared ability/)
    })
    it('only from a module it requires, never one it only uses', () => {
      const tickets = entry({ id: 'tickets', abilities: defineAbilities('tickets', { 'order.find': ability({ impliable: true }) }) })
      expect(() => buildRegistry([core(true), tickets, desk('tickets.order.find', { requires: ['tickets'] })])).not.toThrow()
      expect(() => buildRegistry([core(true), tickets, desk('tickets.order.find', { uses: ['tickets'] })])).toThrow(/requires \(uses is not enough\)/)
      expect(() => buildRegistry([core(true), tickets, desk('tickets.order.find')])).toThrow(/requires/)
    })
  })
  it('takes a record type with fixed ids and no table', () => {
    expect(() => buildRegistry([entry({ id: 'lost-property', records: defineRecords('lost-property', { branding: record({ ids: ['site'] }) }) })])).not.toThrow()
    expect(() => buildRegistry([entry({ id: 'lost-property', records: defineRecords('lost-property', { branding: record({ ids: [] }) }) })])).toThrow(/ids/)
  })
})

describe('navigation entries', () => {
  const schema = (corePoints['core.navigation'] as any).schema
  const base = { id: 'orders', menu: 'account', to: '/account/orders', icon: 'i-lucide-ticket', ability: 'signed-in' }
  it('name a menu, and only an account entry may be for every signed-in person', () => {
    expect(schema.safeParse(base).success).toBe(true)
    expect(schema.safeParse({ ...base, menu: 'console' }).success).toBe(false)
    expect(schema.safeParse({ ...base, shell: 'account' }).success).toBe(false)
  })
  it('hide an empty entry only when it has a count', () => {
    expect(schema.safeParse({ ...base, hideEmpty: true }).success).toBe(false)
    expect(schema.safeParse({ ...base, hideEmpty: true, count: 'box-office.orders.open' }).success).toBe(true)
  })
})

describe('notification types', () => {
  const schema = (domainPoints['core.notification-type'] as any).schema
  const base = { id: 'team.invite', category: 'transactional', side: 'members', channels: ['email'], variables: { link: 'sealed' }, wording: { 'en-GB': { subject: 'Join us', body: '[Accept]({{ link }})' } } }
  it('send a type with a sealed variable by email only', () => {
    expect(schema.safeParse(base).success).toBe(true)
    expect(schema.safeParse({ ...base, channels: ['email', 'inbox'] }).success).toBe(false)
    expect(schema.safeParse({ ...base, channels: ['inbox'] }).success).toBe(false)
    expect(schema.safeParse({ ...base, channels: ['email', 'inbox'], variables: { link: 'url' } }).success).toBe(true)
  })
})

describe('list search words (S3)', () => {
  it('folds case and accents, and ignores a word under three letters', async () => {
    const { searchWords, searchQuery } = await import('../../layers/core/kit/search')
    expect(searchWords('Zoë  Brontë jo')).toEqual({ words: ['zoe', 'bronte'], ignoredWords: ['jo'], searchTooShort: false })
    expect(searchWords('jo li')).toEqual({ words: [], ignoredWords: ['jo', 'li'], searchTooShort: true })
    expect(searchWords('  ')).toEqual({ words: [], ignoredWords: [], searchTooShort: false })
    expect(searchQuery(['zoe', 'say "hi"'], ['name', 'note'])).toBe('{name note} : ("zoe" AND "say ""hi""")')
  })

  it('names the hidden field that matched a row (S5)', async () => {
    const { matchedFields } = await import('../../layers/core/kit/search')
    const fields = [{ key: 'title', hidden: false }, { key: 'season', hidden: true }]
    expect(matchedFields([{ title: 'Hamlet', season: 'Autumn 2026' }, { title: 'Autumn Fair', season: 'Autumn 2026' }], ['hamlet', 'autumn'], fields)).toEqual(['season', null])
  })
})

describe('list sources (S1, S2)', () => {
  it('refuse a searched column that is special, encrypted or not a column', async () => {
    const { text } = await import('drizzle-orm/sqlite-core')
    const { col, defineTable } = await import('../../layers/core/kit/db')
    const { defineListSource } = await import('../../layers/core/kit/lists')
    const { defineList } = await import('../../layers/core/shared/list')
    const { index } = await import('drizzle-orm/sqlite-core')
    const table = defineTable('lost_property_items', {
      id: col.id(),
      owner: col.account('owner_id', { role: 'subject' }),
      label: col.public(text('label')),
      health: col.special('health'),
      token: col.internal(text('token'), { encrypted: true }),
    }, { id: 'lpi', realm: 'operational', extra: t => [index('lost_property_items_label').on(t.label, t.id)] })
    const list = defineList('lost-property.items', {
      filters: { owner: { kind: 'lookup', label: 'Owner' } },
      sorts: { label: { label: 'Label', type: 'text' } },
      columns: { label: { label: 'Label', sort: 'label' } },
      search: ['notes'],
    })
    const bind = (over: Record<string, any> = {}) => defineListSource(list, { table, filters: { owner: { column: 'owner' } }, sorts: { label: { columns: ['label'], index: 'lost_property_items_label' } }, search: { label: 'label', notes: 'label' }, ...over } as any)
    expect(bind().searchIndex).toBe('lost_property_items_search')
    expect(bind({ search: { label: 'label', notes: 'label' } }).search).toEqual([{ field: 'label', key: 'label', sql: 'label' }, { field: 'notes', key: 'label', sql: 'label' }])
    expect(() => bind({ search: { label: 'health', notes: 'label' } })).toThrow(/special data/)
    expect(() => bind({ search: { label: 'token', notes: 'label' } })).toThrow(/encrypted/)
    expect(() => bind({ search: { label: 'nothing', notes: 'label' } })).toThrow(/not a column/)
    expect(() => bind({ search: { label: 'label' } })).toThrow(/search.notes: has no binding/)
    expect(() => bind({ search: { label: 'label', notes: false } })).toThrow(/searching a child is not yet available/)
    expect(() => bind({ filters: { owner: { column: 'owner' }, colour: { column: 'label' } } })).toThrow(/not a filter of the list/)
    expect(() => bind({ filters: { owner: { column: 'token' } } })).toThrow(/encrypted/)
    // A sort names an index that begins with its columns, or the most rows its scan reads.
    expect(() => bind({ sorts: { label: { columns: ['label'], index: 'nowhere' } } })).toThrow(/no index named nowhere/)
    expect(() => bind({ sorts: { label: { columns: ['owner'], index: 'lost_property_items_label' } } })).toThrow(/does not begin with/)
    expect(() => bind({ sorts: { label: { columns: ['owner'], bounded: 0 } } })).toThrow(/whole number/)
    expect(() => bind({ sorts: { label: { columns: ['token'], bounded: 10 } } })).toThrow(/encrypted/)
    expect(bind({ sorts: { label: { columns: ['owner'], bounded: 500 } } }).list.id).toBe('lost-property.items')
  })

  it('tell the generator which index to make, remake or drop', async () => {
    const { indexChanges } = await import('../../scripts/lib/lists')
    const wanted = new Map([['a', ['name']], ['b', ['note', 'title']]])
    const made = new Map<string, string[] | null>([['a', ['name']], ['b', ['title']], ['c', ['x']], ['d', null]])
    expect(indexChanges(wanted, made)).toEqual([{ table: 'b', columns: ['note', 'title'] }, { table: 'c', columns: null }])
  })
})

describe('format additions of 16 November (fixed retention, erase clear, reserved ids)', () => {
  it('allows a fixed retention only on a table about nobody', async () => {
    const { text } = await import('drizzle-orm/sqlite-core')
    const { col, defineTable } = await import('../../layers/core/kit/db')
    expect(() => defineTable('lost_property_pings', { id: col.id(), at: col.createdAt() }, { id: 'lpp', realm: 'system', subject: 'none', retention: { fixed: '30d' } })).not.toThrow()
    expect(() => defineTable('lost_property_pongs', { id: col.id(), at: col.createdAt() }, { id: 'lpq', realm: 'system', subject: 'none', retention: { fixed: 'soon' } })).toThrow(/duration/)
    expect(() => defineTable('lost_property_notes', { id: col.id(), owner: col.account('owner_id', { role: 'subject' }), body: col.freeText(text('body')) }, { id: 'lpn', realm: 'operational', retention: { fixed: '30d' } })).toThrow(/fixed retention/)
  })

  it('takes erase: \'clear\' on an internal column only when it may be null and the rows reach a person', async () => {
    const { text } = await import('drizzle-orm/sqlite-core')
    const { col, defineTable } = await import('../../layers/core/kit/db')
    const owner = () => col.account('owner_id', { role: 'subject' })
    expect(defineTable('lost_property_links', { id: col.id(), owner: owner(), hash: col.internal(text('hash'), { erase: 'clear' }) }, { id: 'lpl', realm: 'audience' })).toBeTruthy()
    expect(() => defineTable('lost_property_links2', { id: col.id(), owner: owner(), hash: col.internal(text('hash').notNull(), { erase: 'clear' }) }, { id: 'lpm', realm: 'audience' })).toThrow(/nullable/)
    expect(() => defineTable('lost_property_links3', { id: col.id(), hash: col.internal(text('hash'), { erase: 'clear' }) }, { id: 'lpo', realm: 'system', subject: 'none' })).toThrow(/subject is none/)
  })

  it('takes erase: \'clear\' on a table that reaches a person through its parents, and refuses a chain that ends nowhere', async () => {
    const { text } = await import('drizzle-orm/sqlite-core')
    const { col, defineTable } = await import('../../layers/core/kit/db')
    const orders = defineTable('lost_property_claims', { id: col.id(), owner: col.account('owner_id', { role: 'subject' }) }, { id: 'lpc', realm: 'audience' })
    const lines = defineTable('lost_property_claim_lines', { id: col.id(), claimId: col.ref('lost_property_claims') }, { id: 'lpd', realm: 'audience', subject: { via: 'claim_id' } })
    const passes = defineTable('lost_property_passes', { id: col.id(), lineId: col.ref('lost_property_claim_lines'), code: col.internal(text('code'), { encrypted: true, erase: 'clear' }) }, { id: 'lpe', realm: 'audience', subject: { via: 'line_id' } })
    const things = defineTable('lost_property_things', { id: col.id() }, { id: 'lpf', realm: 'system', subject: 'none' })
    const strays = defineTable('lost_property_strays', { id: col.id(), thingId: col.ref('lost_property_things'), code: col.internal(text('code'), { erase: 'clear' }) }, { id: 'lpg', realm: 'audience', subject: { via: 'thing_id' } })
    const module = (tables: object) => ({ manifest: defineModule({ manifest: 1, since: '0.1.0', id: 'lost-property', tables } as any), root: 'layers/lost-property', owner: 'upstream', handlers: {} } as unknown as ModuleEntry)
    expect(() => buildRegistry([module({ orders, lines, passes })])).not.toThrow()
    expect(() => buildRegistry([module({ things, strays })])).toThrow(/does not lead to an account or an email/)
    // Erasure finds the pass's rows through both parents, and clears its code.
    const { matchOf } = await import('../../layers/core/server/identity/erasure')
    const { tableMeta } = await import('../../layers/core/kit/db')
    const metas = new Map([orders, lines, passes].map(t => [tableMeta(t)!.name, tableMeta(t)!]))
    expect(matchOf(tableMeta(passes)!, metas)).toMatch(/"line_id" IN \(SELECT id FROM "lost_property_claim_lines" WHERE \("claim_id" IN \(SELECT id FROM "lost_property_claims" WHERE \("owner_id" IN/)
  })

  it('reserves every settled module id', async () => {
    const { RESERVED_MODULE_IDS } = await import('../../layers/core/kit/registry')
    expect(RESERVED_MODULE_IDS).toEqual(expect.arrayContaining(['core', 'box-office', 'payments', 'finance', 'forms', 'front-of-house', 'spaces', 'bar', 'training', 'membership', 'membership-fees', 'communications']))
  })
})

describe('support modules (C-65)', () => {
  const m = (id: string, more: object = {}) => ({ id, ...more })
  it('are on exactly while a module that is on requires them, through other support modules too', () => {
    const modules = [m('core', { switchable: false }), m('occupancy', { support: true }), m('busy', { support: true, requires: ['occupancy'] }), m('spaces', { requires: ['busy'] }), m('rehearsals', { requires: ['occupancy'] })]
    expect([...resolveOn(modules, () => false)].sort()).toEqual(['core'])
    expect([...resolveOn(modules, id => id === 'spaces')].sort()).toEqual(['busy', 'core', 'occupancy', 'spaces'])
    expect([...resolveOn(modules, id => id === 'rehearsals')].sort()).toEqual(['core', 'occupancy', 'rehearsals'])
    // A stored row for a support module is ignored.
    expect([...resolveOn(modules, id => id === 'occupancy')].sort()).toEqual(['core'])
  })
  it('have no switch of their own, so cannot also be always on or start on at setup', () => {
    const base = { id: 'occupancy', manifest: 1 as const, since: '0.1.0' }
    expect(() => defineModule({ ...base, support: true })).not.toThrow()
    expect(() => defineModule({ ...base, support: true, switchable: false })).toThrow(/support/)
    expect(() => defineModule({ ...base, support: true, onAtSetup: true })).toThrow(/onAtSetup/)
  })
})
