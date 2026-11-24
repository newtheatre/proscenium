// calendar-feed-public-safe (C-70, CF4): the kit refuses a core.calendar-feed contribution whose titles
// or locations come from a column that holds anything about a person.
import { describe, expect, it } from 'vitest'
import { text } from 'drizzle-orm/sqlite-core'
import { defineModule, point } from '#kit/manifest'
import { col, defineTable } from '#kit/db'
import { buildRegistry, type ModuleEntry } from '#kit/registry'

const calls = defineTable('drill_calls', {
  id: col.id(),
  title: col.public(text('title').notNull()),
  notes: col.freeText(text('notes')),
  accountId: col.account('account_id', { role: 'subject' }),
  name: col.personal(text('name')),
}, { id: 'drc', realm: 'members' })

const entry = (manifest: object, handlers: object = {}): ModuleEntry => ({ manifest: defineModule({ manifest: 1, since: '0.1.0', ...manifest } as never), root: `layers/${(manifest as { id: string }).id}`, owner: 'upstream', handlers } as unknown as ModuleEntry)
const core = entry({ id: 'core', switchable: false, points: { 'core.calendar-feed': point({ kind: 'code', contract: 'calendar-feed', publicSafe: true }) } })
const drill = (from: unknown) => entry(
  { id: 'drill', tables: { calls }, contributes: { 'core.calendar-feed': [{ id: 'drill.calls', file: 'calls', from }] } },
  { contributions: { 'core.calendar-feed': { calls: { events: async () => [] } } } },
)

describe('a public-safe point', () => {
  it('takes a contribution whose words come from public or internal columns', () => {
    expect(() => buildRegistry([core, drill(['drill_calls.title'])])).not.toThrow()
  })
  it('refuses one that does not say where its words come from', () => {
    expect(() => buildRegistry([core, drill(undefined)])).toThrow(/lists the columns/)
  })
  it('refuses one that names a column nobody declares', () => {
    expect(() => buildRegistry([core, drill(['drill_calls.where'])])).toThrow(/not a column/)
  })
  it('refuses personal and free-text columns', () => {
    expect(() => buildRegistry([core, drill(['drill_calls.title', 'drill_calls.name'])])).toThrow(/personal data/)
    expect(() => buildRegistry([core, drill(['drill_calls.notes'])])).toThrow(/freeText data/)
  })
})
