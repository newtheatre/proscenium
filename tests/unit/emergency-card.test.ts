import { describe, expect, test } from 'bun:test'
import { CONFIG_KEYS, hasDefault, isEnforced } from '#shared/utils/config'
import { configHeading } from '#shared/utils/config-wording'
import { clearNightCache, memoryNightCacheStore, nightCacheKey, writeNightCache } from '#shared/utils/night-cache'
import { shiftClaimForm } from '#shared/utils/tonight'
import { emergencyCardsFor, saysFirstAiders } from '#shared/utils/venue-emergency'

// Issue 1310: the card to anyone signed in, first aiders off the rota, and the duty manager asked at
// the claim. Queries: `tests/integration/tonight.test.ts`; route: `tests/e2e/venue-emergency.test.ts`.

const source = (path: string): Promise<string> => Bun.file(path).text()

describe('who the card says is first-aid trained tonight (E-113 criterion 1 as amended)', () => {
  test('tonight\'s first aiders by first name, each with the jobs they are doing', () => {
    expect(saysFirstAiders([
      { firstName: 'Sam', roles: ['DOOR'] },
      { firstName: 'Alex', roles: ['BAR', 'DUTY_MANAGER'] },
    ], 'Ask the duty manager')).toEqual(['First aiders tonight: Sam (door), Alex (duty manager, bar)'])
  })

  test('nobody trained on tonight\'s rota says so, and keeps the committee\'s own line', () => {
    expect(saysFirstAiders([], 'Ask the duty manager')).toEqual(['No trained first aider is on tonight\'s rota', 'Ask the duty manager'])
    expect(saysFirstAiders([], null)).toEqual(['No trained first aider is on tonight\'s rota'])
  })

  test('with no first-aid module named, the card reads the committee\'s line as it always has', () => {
    expect(saysFirstAiders(null, 'Marian, Tuck')).toEqual(['First aiders tonight: Marian, Tuck'])
    expect(saysFirstAiders(null, null)).toEqual([])
  })
})

describe('the first-aid module ships unset (0019)', () => {
  test('no default, a training module id when set, and worded for the settings screen', () => {
    expect(hasDefault('FIRST_AID_MODULE')).toBe(false)
    expect(isEnforced('FIRST_AID_MODULE')).toBe(false)
    expect(CONFIG_KEYS.FIRST_AID_MODULE.schema.safeParse('SAFE-101').success).toBe(true)
    expect(CONFIG_KEYS.FIRST_AID_MODULE.schema.safeParse('first aid').success).toBe(false)
    expect(configHeading('FIRST_AID_MODULE')).toBe('Training that makes a first aider')
  })
})

describe('a claim may carry the duty manager\'s answer about their number (A-114)', () => {
  test('no body, an empty body and either answer are all a claim', () => {
    expect(shiftClaimForm.safeParse(undefined).success).toBe(true)
    expect(shiftClaimForm.safeParse({}).success).toBe(true)
    expect(shiftClaimForm.parse({ shareNumber: true })).toEqual({ shareNumber: true })
    expect(shiftClaimForm.parse({ shareNumber: false })).toEqual({ shareNumber: false })
  })

  test('anything but a yes or a no is refused', () => {
    expect(shiftClaimForm.safeParse({ shareNumber: 'yes' }).success).toBe(false)
    expect(shiftClaimForm.safeParse({ shareNumber: null }).success).toBe(false)
  })
})

describe('the card is primed and read for anyone, under one key (E-113 criterion 2 as amended)', () => {
  test('the layout primes every venue\'s card with no shift asked for, and the screen reads that key', async () => {
    const layout = await source('app/layouts/tonight.vue')
    const screen = await source('app/pages/tonight/emergency.vue')
    expect(layout).toContain('screen: \'emergency-cards\'')
    expect(screen).toContain('screen: \'emergency-cards\'')
    expect(layout).not.toContain('screen: \'emergency-card\'')
    expect(await source('server/api/tonight/emergency.get.ts')).toContain('requireAccount(event)')
  })
})

// On a shared phone the cached card outlives the person who fetched it, so its numbers go with
// them: a copy stamped for another account keeps its addresses and loses the numbers (A-114).
describe('a cached card\'s numbers are the fetching account\'s alone', () => {
  interface Card { venueId: string, address: string, dutyManagers: { name: string, phone: string }[] | null }
  const answer: { viewerId: string, cards: Card[] } = {
    viewerId: 'rowan',
    cards: [{ venueId: 'house', address: 'Cherry Tree Hill', dutyManagers: [{ name: 'Rowan Ellis', phone: '07700 900333' }] }],
  }

  test('the account that fetched it sees them', () => {
    expect(emergencyCardsFor(answer, 'rowan')).toEqual(answer.cards)
  })

  test('another account, or nobody signed in, sees the card without them', () => {
    for (const viewer of ['mel', null]) {
      expect(emergencyCardsFor(answer, viewer)).toEqual([{ venueId: 'house', address: 'Cherry Tree Hill', dutyManagers: null }])
    }
  })

  test('nothing cached is nothing to show', () => {
    expect(emergencyCardsFor(null, 'rowan')).toBeNull()
  })
})

describe('signing out takes the night off the phone', () => {
  test('every night key goes, and nothing else on the device is touched', () => {
    const store = memoryNightCacheStore()
    const key = nightCacheKey({ screen: 'emergency-cards', night: '2026-10-17', wholeNight: true })
    writeNightCache(store, key, { cards: [] })
    store.setItem('nnt.theme', 'dark')

    expect(clearNightCache(store)).toEqual([key])
    expect(store.getItem(key)).toBeNull()
    expect(store.getItem('nnt.theme')).toBe('dark')
  })

  test('sign-out clears it, and a signed-out visitor never reaches the screen', async () => {
    const status = await source('app/components/AuthStatus.vue')
    expect(status).toContain('clearNightCache(deviceNightCacheStore())')
    expect(await source('app/pages/tonight/emergency.vue')).toContain('middleware: \'signed-in\'')
  })
})

describe('the duty manager is asked at the claim, with no answer chosen for them (issue 1310)', () => {
  test('the rota screen asks before a duty manager claim, starts unanswered and sends the answer', async () => {
    const page = await source('app/pages/rota/index.vue')
    expect(page).toContain('name="claim-duty-manager"')
    expect(page).toContain('const shareNumber = ref<\'yes\' | \'no\' | undefined>(undefined)')
    expect(page).toContain('claim(shift, { shareNumber: shareNumber.value === \'yes\' })')
    expect(page).toContain(':disabled="shareNumber === undefined"')
  })
})
