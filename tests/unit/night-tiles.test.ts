import { describe, expect, test } from 'bun:test'
import { hubTiles, whoCanHelpTonight } from '#shared/utils/night-hub'
import { NIGHT_ROLES, claimedShiftRefusal, nightAuthorityRefusal, outsideWindowRefusal } from '#shared/utils/night-authority'
import { hubRefusal, rolesThatReach, saysScreenIsFor } from '#shared/utils/refusals'
import { viewAccounts, viewProgramme } from '#shared/utils/abilities'

// Issue 1304: the hub is shaped by the viewer's own job, a refused screen says who can help, and a
// signed-in refusal names the role that opens the screen.

const ids = (tiles: { id: string }[]): string[] => tiles.map(tile => tile.id)

describe('the hub shows the tiles the viewer\'s own authority opens (E-112 criterion 1)', () => {
  test('while the roles are unknown, or the phone is offline, every tile shows', () => {
    expect(ids(hubTiles(null))).toEqual(['door', 'till', 'glance', 'checklist', 'report', 'age-checks', 'backstage', 'contacts', 'emergency'])
    expect(hubTiles(null).some(tile => tile.gold)).toBe(false)
  })

  test('a door shift leads with the door, in gold, and is offered nothing that refuses it', () => {
    const tiles = hubTiles(['DOOR'])
    expect(ids(tiles)).toEqual(['door', 'glance', 'age-checks', 'contacts', 'emergency'])
    expect(tiles.filter(tile => tile.gold).map(tile => tile.id)).toEqual(['door'])
  })

  test('a bar shift leads with the till', () => {
    const tiles = hubTiles(['BAR'])
    expect(ids(tiles)).toEqual(['till', 'glance', 'age-checks', 'contacts', 'emergency'])
    expect(tiles[0]).toEqual({ id: 'till', gold: true })
  })

  test('the duty manager leads with the glance and holds the night\'s own screens', () => {
    const tiles = hubTiles(['DUTY_MANAGER'])
    expect(ids(tiles)).toEqual(['glance', 'checklist', 'report', 'age-checks', 'backstage', 'contacts', 'emergency'])
    expect(tiles[0]).toEqual({ id: 'glance', gold: true })
  })

  test('holding more than one role shows each one\'s screens, the duty manager\'s job first', () => {
    expect(ids(hubTiles(['DOOR', 'DUTY_MANAGER']))).toEqual(['glance', 'door', 'checklist', 'report', 'age-checks', 'backstage', 'contacts', 'emergency'])
  })

  test('no role tonight leaves Emergency, always there', () => {
    expect(hubTiles([])).toEqual([{ id: 'emergency', gold: false }])
  })
})

// Refused every role, the hub says the most specific reason the server ranked, not "not on shift".
describe('the hub keeps a refusal that says more than no shift (issue 1304, issue 1303)', () => {
  test('a door shift outside its window sees its hours', () => {
    const said = outsideWindowRefusal('18:30 to 23:00').statusMessage
    expect(hubRefusal(said)).toBe(said)
  })

  test('a claim not yet confirmed says who confirms it', () => {
    const said = claimedShiftRefusal('DOOR').statusMessage
    expect(hubRefusal(said)).toBe(said)
  })

  test('no shift of any kind leaves the hub\'s own line', () => {
    for (const role of NIGHT_ROLES) expect(hubRefusal(nightAuthorityRefusal(role).statusMessage)).toBeNull()
    expect(hubRefusal(nightAuthorityRefusal('DOOR', { firstName: 'Rowan' }).statusMessage)).toBeNull()
    expect(hubRefusal(null)).toBeNull()
  })
})

describe('a refused screen names who can help tonight (issue 1304)', () => {
  test('tonight\'s duty manager by first name', () => {
    expect(whoCanHelpTonight([
      { role: 'DOOR', filled: true, name: 'Priya Shah' },
      { role: 'DUTY_MANAGER', filled: true, name: 'Rowan Ellis' },
    ])).toBe('Ask Rowan, tonight\'s duty manager.')
  })

  test('an unfilled or unknown duty manager is still named by the job', () => {
    expect(whoCanHelpTonight([{ role: 'DUTY_MANAGER', filled: false, name: null }])).toBe('Ask tonight\'s duty manager.')
    expect(whoCanHelpTonight(null)).toBe('Ask tonight\'s duty manager.')
  })
})

describe('a signed-in refusal names the role that opens the screen (issue 1304, K-133)', () => {
  test('the desk is the Front of House Manager\'s, never the IT Manager\'s to explain', () => {
    expect(rolesThatReach(viewProgramme)).toEqual(['FOH_MANAGER'])
    expect(rolesThatReach(viewAccounts)).not.toContain('ADMIN')
    expect(saysScreenIsFor(['FOH_MANAGER'])).toBe('This screen is for the Front of House Manager.')
  })

  test('two or more roles are joined in words, and none says so plainly', () => {
    expect(saysScreenIsFor(['FOH_MANAGER', 'TREASURER'])).toBe('This screen is for the Front of House Manager or the Treasurer.')
    expect(saysScreenIsFor([])).toBe('Your account does not open this screen')
  })
})
