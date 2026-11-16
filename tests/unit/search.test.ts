import { describe, expect, it } from 'vitest'
import { matchSettings, settingsPageOf } from '../../layers/core/shared/search'

const index = [
  { key: 'seats.hold.duration', module: 'seats', section: 'hold', labelKey: 'a.label', helpKey: 'a.help' },
  { key: 'core.brand.name', module: 'core', section: 'brand', labelKey: 'b.label', helpKey: 'b.help' },
]
const words: Record<string, string> = {
  'a.label': 'Hold time', 'a.help': 'How long seats stay held for a customer.',
  'b.label': 'Theatre name', 'b.help': 'Shown in the header and on tickets.',
}
const t = (k: string) => words[k] ?? k

describe('matchSettings (UI-15)', () => {
  it('finds a setting by a word in its label or help', () => {
    expect(matchSettings(index, 'hold', t).map(h => h.key)).toEqual(['seats.hold.duration'])
    expect(matchSettings(index, 'tickets', t).map(h => h.key)).toEqual(['core.brand.name'])
  })
  it('needs every word', () => {
    expect(matchSettings(index, 'hold tickets', t)).toEqual([])
    expect(matchSettings(index, 'seats customer', t)).toHaveLength(1)
  })
  it('lists label matches before help matches', () => {
    expect(matchSettings(index, 'name', t).map(h => h.key)).toEqual(['core.brand.name'])
    expect(matchSettings(index, 'seats', t)[0]!.key).toBe('seats.hold.duration')
  })
  it('returns nothing for an empty term and links to the setting on its own page', () => {
    expect(matchSettings(index, '  ', t)).toEqual([])
    expect(matchSettings(index, 'theatre', t)[0]!.to).toBe('/console/system/settings?setting=core.brand.name')
    expect(settingsPageOf('seats')).toBe('/console/seats/settings')
    expect(settingsPageOf('core', 'site')).toBe('/admin/settings')
  })
})
