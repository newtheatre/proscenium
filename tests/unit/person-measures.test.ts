// Figures per person (core.person-measure): what definePersonMeasure and the registry refuse (R3-27).
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ability, defineAbilities } from '#kit/abilities'
import { defineModule, point } from '#kit/manifest'
import { definePersonMeasure, type PersonMeasure } from '#kit/measures'
import { buildRegistry, type ModuleEntry } from '#kit/registry'

const read = async () => ({ rows: [] })
const minutes = (extra: Partial<PersonMeasure> = {}): PersonMeasure => ({ label: 'rota.measures.minutes', unit: 'minutes', combine: 'sum', by: ['performance'], ability: 'rota.hours.view', purpose: 'rota.hours', side: 'members', read, ...extra })

describe('declaring a figure per person', () => {
  it('takes members-side figures in counts or minutes, broken down by shared keys only', () => {
    expect(() => definePersonMeasure(minutes())).not.toThrow()
    expect(() => definePersonMeasure(minutes({ side: 'audience' as never }))).toThrow(/members/)
    expect(() => definePersonMeasure(minutes({ unit: 'money' as never }))).toThrow(/unit/)
    expect(() => definePersonMeasure(minutes({ by: ['rota.shift' as never] }))).toThrow(/shared/)
  })
  it('needs a purpose and an ability', () => {
    expect(() => definePersonMeasure(minutes({ purpose: '' }))).toThrow(/purpose/)
    expect(() => definePersonMeasure(minutes({ ability: 'view' }))).toThrow(/ability/)
  })
})

describe('the registry\'s figures per person', () => {
  const core = { manifest: defineModule({ id: 'core', manifest: 1, since: '0.1.0', points: { 'core.person-measure': point({ kind: 'code', contract: 'person-measure' }), 'core.privacy-record': point({ kind: 'data', schema: z.object({ id: z.string() }).passthrough() }) } } as any), root: 'layers/core', owner: 'upstream', handlers: {} } as unknown as ModuleEntry
  const audited = ability({ risk: 'privileged', fresh: false, audit: 'read' })
  const rota = (figures: Record<string, PersonMeasure>, abilities: Record<string, ReturnType<typeof ability>> = { 'hours.view': audited }) => ({
    manifest: defineModule({ id: 'rota', manifest: 1, since: '0.1.0', abilities: defineAbilities('rota', abilities), contributes: { 'core.privacy-record': [{ id: 'rota.hours', holds: 'Shifts', why: 'Thanks', keptFor: 'A year' }], 'core.person-measure': Object.keys(figures).map(id => ({ id, file: id.split('.').pop() })) } } as any),
    root: 'layers/rota',
    owner: 'upstream',
    handlers: { contributions: { 'core.person-measure': Object.fromEntries(Object.entries(figures).map(([id, m]) => [id.split('.').pop(), m])) } },
  }) as unknown as ModuleEntry

  it('accepts a figure named under its module, with a privileged ability audited on reading and a purpose', () => {
    expect(() => buildRegistry([core, rota({ 'rota.minutes': minutes() })])).not.toThrow()
  })
  it('refuses a figure not named under its module', () => {
    expect(() => buildRegistry([core, rota({ minutes: minutes() })])).toThrow(/rota\.<figure>/)
  })
  it('refuses an undeclared ability, and one that is not privileged or not audited on reading', () => {
    expect(() => buildRegistry([core, rota({ 'rota.minutes': minutes({ ability: 'rota.hours.see' }) })])).toThrow(/not a declared ability/)
    expect(() => buildRegistry([core, rota({ 'rota.minutes': minutes() }, { 'hours.view': ability() })])).toThrow(/privileged/)
    expect(() => buildRegistry([core, rota({ 'rota.minutes': minutes() }, { 'hours.view': ability({ risk: 'privileged' }) })])).toThrow(/audit/)
  })
  it('refuses a purpose that is not in the privacy record', () => {
    expect(() => buildRegistry([core, rota({ 'rota.minutes': minutes({ purpose: 'rota.unknown' }) })])).toThrow(/privacy-record/)
  })
})
