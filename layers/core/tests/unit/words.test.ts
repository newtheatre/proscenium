// The server's lookup into a module's catalogue, for phrases built into a message's variables.
import { describe, expect, it } from 'vitest'
import { siteWords, wordsFrom } from '../../kit/words'
import { buildRegistry, installRegistry, type ModuleEntry } from '../../kit/registry'
import frontOfHouse from '../../../front-of-house/i18n/en-GB.json'

describe('wordsFrom', () => {
  const say = wordsFrom({ 'm.where': 'Where: {place}', 'm.n.one': 'One shift', 'm.n.other': '{count} shifts' })

  it('fills placeholders and picks the plural by count', () => {
    expect(say('m.where', { place: 'Main house' })).toBe('Where: Main house')
    expect(say('m.n', { count: 1 })).toBe('One shift')
    expect(say('m.n', { count: 3 })).toBe('3 shifts')
  })

  it('answers with the key when the catalogue lacks it, as the app does', () => {
    expect(say('m.missing')).toBe('m.missing')
  })

  it('reads a module catalogue the server bundles', () => {
    expect(wordsFrom(frontOfHouse)('front-of-house.shift-details.ends', { time: '22:30' })).toBe('Shift ends: about 22:30')
  })
})

describe('siteWords', () => {
  it('looks a key up in whichever module\'s catalogue holds it, as a report words another module\'s figure', () => {
    const entry = (id: string, words: Record<string, string>): ModuleEntry => ({ manifest: { id, manifest: 1, since: '0.1.0', stability: 'experimental' } as ModuleEntry['manifest'], root: `layers/${id}`, owner: 'upstream', handlers: { listeners: {}, jobs: {}, tasks: {}, facts: {}, calls: {}, lists: {}, contributions: {} }, words })
    installRegistry(buildRegistry([entry('alpha', { 'alpha.sold': 'Tickets sold' }), entry('beta', { 'beta.total': 'Total' })]))
    expect(siteWords()('alpha.sold')).toBe('Tickets sold')
    expect(siteWords()('beta.total')).toBe('Total')
  })
})
