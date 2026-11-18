// The server's lookup into a module's catalogue, for phrases built into a message's variables.
import { describe, expect, it } from 'vitest'
import { wordsFrom } from '../../kit/words'
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
