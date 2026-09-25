import { describe, expect, test } from 'bun:test'
import { CONFIG_KEYS } from '#shared/utils/config'
import {
  eligibilityHealth,
  eligibilityStanding,
  missingSystemChecks,
  saysChecklistReadiness,
  saysEligibility,
  saysNotOpenYet,
  venueReady,
} from '#shared/utils/rota-readiness'
import type { RoleEligibility, VenueReadiness } from '#shared/utils/rota-readiness'

// Issue 1318: what a show night needs before a volunteer can take a shift at it, read from one
// card by the rota's owner, and the eligibility line /api/health reports (E-103 criterion 4).

describe('the three gating modules ship as the committee named them (issue 1318, docs/workshops.md)', () => {
  test('duty manager, door and bar default to the named modules', () => {
    expect(CONFIG_KEYS.SHIFT_ELIGIBILITY_DUTY_MANAGER_MODULE.default).toBe('ADMN-201')
    expect(CONFIG_KEYS.SHIFT_ELIGIBILITY_DOOR_MODULE.default).toBe('ADMN-103')
    expect(CONFIG_KEYS.SHIFT_ELIGIBILITY_BAR_MODULE.default).toBe('ADMN-102')
  })

  test('null is still accepted, and still refuses every claim (E-103 criterion 4)', () => {
    expect(CONFIG_KEYS.SHIFT_ELIGIBILITY_DOOR_MODULE.schema.safeParse(null).success).toBe(true)
  })
})

describe('a gating key reads as set only when it names a published module', () => {
  test('no module named is unset', () => {
    expect(eligibilityStanding(null, null)).toBe('UNSET')
  })

  test('an id the catalogue does not carry is missing', () => {
    expect(eligibilityStanding('ADMN-999', null)).toBe('MISSING')
  })

  test('a draft module is a draft, and a retired one retired', () => {
    expect(eligibilityStanding('ADMN-201', 'DRAFT')).toBe('DRAFT')
    expect(eligibilityStanding('ADMN-201', 'RETIRED')).toBe('RETIRED')
  })

  test('a published module is set', () => {
    expect(eligibilityStanding('ADMN-102', 'ACTIVE')).toBe('SET')
  })
})

describe('the health line (issue 1318)', () => {
  const line = (role: RoleEligibility['role'], standing: RoleEligibility['standing']): RoleEligibility =>
    ({ role, moduleId: standing === 'UNSET' ? null : 'ADMN-103', moduleName: 'Box Office and Ticketing', standing })

  test('is healthy only while every role names a published module', () => {
    expect(eligibilityHealth([line('DUTY_MANAGER', 'SET'), line('DOOR', 'SET'), line('BAR', 'SET')]).ok).toBe(true)
    expect(eligibilityHealth([line('DUTY_MANAGER', 'SET'), line('DOOR', 'DRAFT'), line('BAR', 'SET')]).ok).toBe(false)
    expect(eligibilityHealth([line('DUTY_MANAGER', 'SET'), line('DOOR', 'SET'), line('BAR', 'UNSET')]).ok).toBe(false)
  })

  test('reports each role by its standing and names no module, since the route is public', () => {
    const health = eligibilityHealth([line('DUTY_MANAGER', 'RETIRED'), line('DOOR', 'DRAFT'), line('BAR', 'UNSET')])
    expect(health.roles).toEqual({ DUTY_MANAGER: 'RETIRED', DOOR: 'DRAFT', BAR: 'UNSET' })
    expect(JSON.stringify(health)).not.toContain('ADMN')
  })

  test('a role the lines leave out reads as unset rather than set', () => {
    expect(eligibilityHealth([]).roles.BAR).toBe('UNSET')
  })
})

describe('the readiness card says each role in words an officer without settings can read', () => {
  test('a published module names itself and its id', () => {
    expect(saysEligibility({ role: 'BAR', moduleId: 'ADMN-102', moduleName: 'Selling Alcohol', standing: 'SET' }))
      .toBe('Unlocked by Selling Alcohol (ADMN-102).')
  })

  test('an unset role says nobody can claim it', () => {
    expect(saysEligibility({ role: 'DOOR', moduleId: null, moduleName: null, standing: 'UNSET' }))
      .toBe('No module named yet, so nobody can claim a door shift.')
  })

  test('a draft module says why nobody holds it', () => {
    const said = saysEligibility({ role: 'DUTY_MANAGER', moduleId: 'ADMN-201', moduleName: 'Committee Operations and Governance', standing: 'DRAFT' })
    expect(said).toContain('Committee Operations and Governance (ADMN-201) is still a draft')
    expect(said).toContain('duty manager shift')
  })

  test('a missing module names the id it was set to', () => {
    expect(saysEligibility({ role: 'BAR', moduleId: 'ADMN-999', moduleName: null, standing: 'MISSING' }))
      .toContain('Names ADMN-999, which is not in the catalogue')
  })
})

describe('a role not open yet names whom to ask (issue 1318)', () => {
  test('the Front of House Manager by name, where somebody holds the role', () => {
    expect(saysNotOpenYet(['Sam Ortiz'])).toBe('Not open for claiming yet: ask Sam Ortiz, the Front of House Manager.')
    expect(saysNotOpenYet(['Sam Ortiz', 'Priya Shah'])).toBe('Not open for claiming yet: ask Sam Ortiz or Priya Shah, the Front of House Manager.')
  })

  test('the role alone where nobody holds it', () => {
    expect(saysNotOpenYet([])).toBe('Not open for claiming yet: ask the Front of House Manager.')
  })
})

describe('a venue we run is ready once staffed, checked and carded (E-101, E-113, E-114)', () => {
  const ready: VenueReadiness = {
    venueId: 'v',
    venueName: 'Main House',
    templateSlots: 4,
    systemChecks: ['NO_SHOW_HOLDS_RELEASED', 'INCIDENTS_REVIEWED'],
    emergencyFiled: true,
  }

  test('with a template, both system checks and a filed card', () => {
    expect(venueReady(ready)).toBe(true)
  })

  test('not without a template, a system check or a filed card', () => {
    expect(venueReady({ ...ready, templateSlots: 0 })).toBe(false)
    expect(venueReady({ ...ready, systemChecks: ['INCIDENTS_REVIEWED'] })).toBe(false)
    expect(venueReady({ ...ready, emergencyFiled: false })).toBe(false)
  })

  test('names the system check that is missing', () => {
    expect(missingSystemChecks(['INCIDENTS_REVIEWED'])).toEqual(['NO_SHOW_HOLDS_RELEASED'])
    expect(saysChecklistReadiness(['INCIDENTS_REVIEWED'])).toContain('No-show holds released')
    expect(saysChecklistReadiness(ready.systemChecks)).toBe('Both system checks are on the post-show checklist.')
  })
})
