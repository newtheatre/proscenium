import { describe, expect, test } from 'bun:test'
import { saysPassPrices } from '#shared/utils/passes'
import { saysPlaceNote } from '#shared/utils/training-signup'

// The member's training, passes and account screens: names rather than codes, an action beside
// every suggestion, a waitlisted place that says so, and a way out (G-101, G-102, D-123, A-112,
// H-104, issue 1153 item 6).

describe('what a pass costs, beside its name (D-123 criterion 7)', () => {
  test('one price reads as the price and what it is', () => {
    expect(saysPassPrices([{ label: 'Standard', price: 3000 }])).toBe('£30.00 standard')
  })

  test('several prices are all shown, in the order they come', () => {
    expect(saysPassPrices([{ label: 'Standard', price: 3000 }, { label: 'Member', price: 2000 }]))
      .toBe('£30.00 standard, £20.00 member')
  })

  test('a type with no price point says so rather than showing nothing', () => {
    expect(saysPassPrices([])).toBe('Price set when it is issued')
  })
})

describe('a waitlisted place says so (G-102 criterion 7)', () => {
  test('a place says how to give it up', () => {
    expect(saysPlaceNote({ placed: true, waitlistPosition: null }, ''))
      .toBe('Withdraw here if you cannot make it after all.')
  })

  test('a waiting place never claims you are in', () => {
    const note = saysPlaceNote({ placed: false, waitlistPosition: 3 }, '')
    expect(note).not.toContain('You are in')
    expect(note).toBe('A place opens for you if somebody withdraws, and you are told when it does.')
  })

  test('what the module usually follows is added to either, not instead of it', () => {
    const note = saysPlaceNote({ placed: false, waitlistPosition: 2 }, 'LX-1 Lighting basics')
    expect(note).toStartWith('A place opens for you')
    expect(note).toContain('LX-1')
  })
})

const TRAINING = 'app/pages/training/index.vue'
const SESSIONS = 'app/pages/training/sessions/index.vue'
const PASSES = 'app/pages/account/passes.vue'
const SECURITY = 'app/pages/account/security.vue'
const NOTIFICATIONS = 'app/pages/account/notifications.vue'

const read = (path: string): Promise<string> => Bun.file(path).text()

describe('the training screens name a module (G-101 criterion 7, issue 1153 item 6)', () => {
  test('a button to ask for a module says its name, not its code', async () => {
    const source = await read(TRAINING)
    expect(source).not.toContain('Ask for ${record.moduleId}')
    expect(source).not.toContain('Asked for ${record.moduleId}')
  })

  test('every suggestion carries the one action that acts on it', async () => {
    const source = await read(TRAINING)
    const section = source.split('What you could do next')[1]?.split('What you have asked for')[0] ?? ''
    expect(section).toContain('ask-next-')
  })
})

describe('a way out and one message per change (A-112, H-104, issue 1153 item 6)', () => {
  test('setting up an authenticator app can be stopped part way', async () => {
    expect(await read(SECURITY)).toContain('data-test="mfa-cancel"')
  })

  test('no switch for a channel nothing delivers', async () => {
    const source = await read(NOTIFICATIONS)
    expect(source).not.toContain('label="Push"')
    expect(source).not.toContain('nothing delivers them yet')
  })

  test('a toggle saved does not raise a message of its own', async () => {
    const source = await read(NOTIFICATIONS)
    expect(source).not.toContain("title: 'Saved'")
  })

  test('the sessions screen no longer tells a waiting member they are in', async () => {
    expect(await read(SESSIONS)).not.toContain('You are in.')
  })

  test('a pass on offer shows what it costs and what it is', async () => {
    const source = await read(PASSES)
    expect(source).toContain('saysPassPrices')
    expect(source).toContain('type.description')
  })
})
