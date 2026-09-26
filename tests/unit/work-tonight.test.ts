import { describe, expect, test } from 'bun:test'
import { dutyManagerToTell } from '#server/utils/tonight'
import { can, canWorkTonight } from '#shared/utils/abilities'
import { landingAfterSignIn, onShiftAt, worksTonight } from '#shared/utils/night-authority'
import { SHELL_NAV } from '#shared/utils/site-nav'
import { releaseStillOpen, tonightToolFor } from '#shared/utils/tonight'
import type { Viewer } from '#shared/utils/abilities'
import type { Permission } from '#shared/utils/roles'

// One fact for "can work tonight", read wherever a person who can work tonight looks (0094,
// amending 0040, issue 1305). The query behind `onShiftTonight` is pinned in tests/integration.

const viewer = (onShiftTonight: boolean, permissions: Permission[] = []): Viewer =>
  ({ id: 'someone', permissions, onShiftTonight, leadsDepartment: false, isTrainer: false, membershipState: { kind: 'none' } })

describe('a person can work tonight on a shift in its window, or by a night permission (0094)', () => {
  test('a confirmed shift in its window is enough, with no permission at all', () => {
    expect(worksTonight(viewer(true))).toBe(true)
  })

  test('each of the three night permissions is enough without a shift', () => {
    for (const permission of ['night.door', 'night.till', 'night.manage'] as Permission[]) {
      expect(worksTonight(viewer(false, [permission]))).toBe(true)
    }
  })

  test('planning the rota is not working tonight', () => {
    expect(worksTonight(viewer(false, ['rota.read', 'rota.write']))).toBe(false)
    expect(worksTonight(viewer(false))).toBe(false)
  })

  test('the ability is the same fact, and a guest is refused rather than thrown at', () => {
    expect(can(viewer(true), canWorkTonight)).toBe(true)
    expect(can(viewer(false, ['night.till']), canWorkTonight)).toBe(true)
    expect(can(viewer(false, ['rota.write']), canWorkTonight)).toBe(false)
    expect(can(null, canWorkTonight)).toBe(false)
  })
})

describe('on shift means inside a confirmed shift\'s own window, with its grace (0078, 0094)', () => {
  const window = { startsAt: 10_000, endsAt: 20_000 }
  const GRACE = 15

  test('inside the window, and inside the grace either side of it', () => {
    expect(onShiftAt([window], 15_000, GRACE)).toBe(true)
    expect(onShiftAt([window], 10_000 - GRACE * 60, GRACE)).toBe(true)
    expect(onShiftAt([window], 20_000 + GRACE * 60, GRACE)).toBe(true)
  })

  test('before the grace opens, or after it closes, is not on shift', () => {
    expect(onShiftAt([window], 10_000 - GRACE * 60 - 1, GRACE)).toBe(false)
    expect(onShiftAt([window], 20_000 + GRACE * 60 + 1, GRACE)).toBe(false)
  })

  test('a shift stamped with no window bounds nobody, as the guard reads it', () => {
    expect(onShiftAt([{ startsAt: null, endsAt: null }], 0, GRACE)).toBe(true)
  })

  test('any one of several windows is enough, and none at all is not on shift', () => {
    expect(onShiftAt([{ startsAt: 0, endsAt: 1 }, window], 15_000, GRACE)).toBe(true)
    expect(onShiftAt([], 15_000, GRACE)).toBe(false)
  })
})

describe('sign-in lands on tonight in the window, and an explicit next always wins (0094)', () => {
  test('no next: tonight for somebody on shift, the home page otherwise', () => {
    expect(landingAfterSignIn(undefined, true)).toBe('/tonight')
    expect(landingAfterSignIn(undefined, false)).toBe('/')
  })

  test('an explicit next wins, the home page included', () => {
    expect(landingAfterSignIn('/rooms/mine', true)).toBe('/rooms/mine')
    expect(landingAfterSignIn('/', true)).toBe('/')
  })

  test('a next that is not a path on this site is no next at all', () => {
    expect(landingAfterSignIn('//evil.example/', true)).toBe('/tonight')
    expect(landingAfterSignIn('https://evil.example/', false)).toBe('/')
    expect(landingAfterSignIn(['/rooms'], false)).toBe('/')
  })
})

describe('Tonight is the account menu\'s first entry, for whoever can work tonight (0094)', () => {
  test('first, and gated on the one fact', () => {
    expect(SHELL_NAV[0]).toMatchObject({ label: 'Tonight', to: '/tonight', ability: canWorkTonight })
  })
})

describe('a shift tonight opens its own tool, named in words (issue 1305)', () => {
  test('each role names the screen it opens, never the rota\'s value', () => {
    expect(tonightToolFor('DOOR')).toEqual({ label: 'Open the door screen', to: '/tonight/door' })
    expect(tonightToolFor('BAR')).toEqual({ label: 'Open the till', to: '/tonight/till' })
    expect(tonightToolFor('DUTY_MANAGER')).toEqual({ label: 'Open tonight', to: '/tonight' })
  })
})

// The server refuses a release once the show night has begun (E-107 criterion 1), so My rota
// stops offering one at the same moment and offers the duty manager instead (issue 1305).
describe('a release is offered only until the shift\'s show night begins (E-107 criterion 1)', () => {
  // 2026-10-17T18:30Z is 19:30 in London; that show night began at 04:00 London, 03:00Z.
  const curtain = Math.floor(Date.UTC(2026, 9, 17, 18, 30) / 1000)

  test('the day before, and up to 04:00 on the day, it can still be released', () => {
    expect(releaseStillOpen(curtain, Math.floor(Date.UTC(2026, 9, 16, 12, 0) / 1000))).toBe(true)
    expect(releaseStillOpen(curtain, Math.floor(Date.UTC(2026, 9, 17, 2, 59) / 1000))).toBe(true)
  })

  test('from 04:00 on the day it cannot, whether before or after the curtain', () => {
    expect(releaseStillOpen(curtain, Math.floor(Date.UTC(2026, 9, 17, 3, 0) / 1000))).toBe(false)
    expect(releaseStillOpen(curtain, curtain + 3600)).toBe(false)
  })
})

describe('the duty manager to tell, from tonight\'s own team (E-112 criterion 2, A-114)', () => {
  const slot = (role: 'DUTY_MANAGER' | 'DOOR', status: 'CONFIRMED' | 'CLAIMED', name: string, phone: string | null) =>
    ({ shiftId: `${role}-${name}`, role, status, filled: status === 'CONFIRMED', claimed: status === 'CLAIMED', name, phone })

  test('the confirmed duty manager, by first name, with the number only where it was shared', () => {
    expect(dutyManagerToTell([slot('DOOR', 'CONFIRMED', 'Priya Nair', '07700 900001'), slot('DUTY_MANAGER', 'CONFIRMED', 'Rowan Ellis', null)]))
      .toEqual({ firstName: 'Rowan', phone: null })
    expect(dutyManagerToTell([slot('DUTY_MANAGER', 'CONFIRMED', 'Rowan Ellis', '07700 900002')]))
      .toEqual({ firstName: 'Rowan', phone: '07700 900002' })
  })

  test('a claimed duty manager is nobody to tell yet, and no duty manager is none', () => {
    expect(dutyManagerToTell([slot('DUTY_MANAGER', 'CLAIMED', 'Aoife Byrne', null)])).toBeNull()
    expect(dutyManagerToTell([])).toBeNull()
  })
})

// Read as source, as the other screen conventions are: the words and the controls a volunteer on
// shift meets on /my, /rota and every public and member page (issue 1305).
describe('where a volunteer on shift looks (issue 1305)', () => {
  const read = (path: string): Promise<string> => Bun.file(path).text()

  test('/my names the role in words, and a claim as waiting to be confirmed', async () => {
    const tile = await read('app/components/my/tiles/NextShift.vue')
    expect(tile).toContain('saysShiftRole(')
    expect(tile).toContain('Claimed, waiting to be confirmed')
    expect(tile).not.toContain('summary.shift?.role }}')
  })

  test('My rota carries a Tonight card with the window, the tool and the duty manager, not Release', async () => {
    const page = await read('app/pages/rota/index.vue')
    expect(page).toContain('data-test="tonight-card"')
    expect(page).toContain('tonightToolFor(')
    expect(page).toContain('saysWindow(')
    expect(page).toContain('releaseStillOpen(')
    expect(page).toContain('data-test="tell-duty-manager"')
  })

  test('a 48px on-shift bar sits on the public and member pages', async () => {
    const bar = await read('app/components/OnShiftBar.vue')
    expect(bar).toContain('min-h-12')
    expect(bar).toContain('to="/tonight"')
    expect(bar).toContain('onShiftTonight')
    for (const layout of ['app/layouts/default.vue', 'app/layouts/member.vue']) {
      expect(await read(layout)).toContain('<OnShiftBar')
    }
  })

  test('every sign-in way lands through the one rule', async () => {
    for (const page of ['app/pages/sign-in.vue', 'app/pages/magic.vue']) {
      expect(await read(page)).toContain('landingAfterSignIn(')
    }
  })
})
