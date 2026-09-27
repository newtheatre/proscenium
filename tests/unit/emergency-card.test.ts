import { describe, expect, test } from 'bun:test'
import { CONFIG_KEYS, hasDefault, isEnforced } from '#shared/utils/config'
import { configHeading } from '#shared/utils/config-wording'
import { shiftClaimForm } from '#shared/utils/tonight'
import { saysFirstAiders } from '#shared/utils/venue-emergency'

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

describe('the duty manager is asked at the claim, with no answer chosen for them (issue 1310)', () => {
  test('the rota screen asks before a duty manager claim, starts unanswered and sends the answer', async () => {
    const page = await source('app/pages/rota/index.vue')
    expect(page).toContain('name="claim-duty-manager"')
    expect(page).toContain('const shareNumber = ref<\'yes\' | \'no\' | undefined>(undefined)')
    expect(page).toContain('claim(shift, { shareNumber: shareNumber.value === \'yes\' })')
    expect(page).toContain(':disabled="shareNumber === undefined"')
  })
})
