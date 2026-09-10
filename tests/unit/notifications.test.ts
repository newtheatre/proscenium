import { describe, expect, test } from 'bun:test'
import { undeliverableReason } from '#shared/utils/deliverability'
import {
  MESSAGE_TYPES,
  NOTIFICATION_STATUSES,
  NOTIFICATION_TOPICS,
  TOPIC_DESCRIPTIONS,
  TOPIC_LABELS,
  defaultFor,
  deliversOn,
  isTransactional,
  messageType,
  preferenceForm,
  preferenceIsSettable,
} from '#shared/utils/notifications'
import { CONFIG_KEYS } from '#shared/utils/config'
import type { MessageType, Preference, PreferenceDefaults } from '#shared/utils/notifications'

const transactional: MessageType = { topic: null, channels: ['EMAIL'], template: 't' }
const onTopic: MessageType = { topic: 'BOOKINGS', channels: ['EMAIL', 'INBOX', 'PUSH'], template: 't' }
const allOff: Preference[] = [{ topic: 'BOOKINGS', email: false, push: false }]

describe('the message catalogue (H-101)', () => {
  test('an unregistered type cannot be sent', () => {
    expect(() => messageType('booking.confirmed')).toThrow(/not a registered message type/)
    expect(() => messageType('')).toThrow()
  })

  test('a registered type resolves to its entry', () => {
    expect(messageType('account.verify').template).toBe('account-verify')
  })

  // The flag lives on the type, never at the call site, so every transactional type is one
  // query away (H-103 criterion 1).
  test('every catalogue entry declares its topic or its absence explicitly', () => {
    for (const [name, type] of Object.entries(MESSAGE_TYPES)) {
      expect(`${name}: ${'topic' in type}`).toBe(`${name}: true`)
      expect(`${name}: ${type.channels.length > 0}`).toBe(`${name}: true`)
    }
  })
})

describe('transactional messages always deliver (H-103)', () => {
  test('a transactional message ignores every preference switched off', () => {
    expect(deliversOn(transactional, 'EMAIL', allOff)).toBe(true)
    expect(isTransactional(transactional)).toBe(true)
  })

  test('a topic message obeys its preference', () => {
    expect(deliversOn(onTopic, 'EMAIL', allOff)).toBe(false)
    expect(deliversOn(onTopic, 'EMAIL', [{ topic: 'BOOKINGS', email: true, push: false }])).toBe(true)
  })

  test('a preference for another topic does not silence this one', () => {
    expect(deliversOn(onTopic, 'EMAIL', [{ topic: 'ROOMS', email: false, push: false }])).toBe(true)
  })

  test('an absent preference means yes', () => {
    expect(deliversOn(onTopic, 'EMAIL', [])).toBe(true)
  })

  // A topic left out of the configured default starts switched off, so a workshop can decide
  // what a new account hears about (H-102 criterion 2).
  test('an absent preference falls to the configured default, not to yes', () => {
    const defaults: PreferenceDefaults = { email: ['SHIFTS'], push: [] }
    expect(deliversOn(onTopic, 'EMAIL', [], defaults)).toBe(false)
    expect(deliversOn({ ...onTopic, topic: 'SHIFTS' }, 'EMAIL', [], defaults)).toBe(true)
  })

  test('a stored preference beats the default in both directions', () => {
    const defaults: PreferenceDefaults = { email: [], push: ['BOOKINGS'] }
    expect(deliversOn(onTopic, 'EMAIL', [{ topic: 'BOOKINGS', email: true, push: false }], defaults)).toBe(true)
    expect(deliversOn(onTopic, 'PUSH', [{ topic: 'BOOKINGS', email: true, push: false }], defaults)).toBe(false)
  })

  test('with no defaults supplied at all, email is on and push is off', () => {
    expect(defaultFor('ROOMS', 'EMAIL')).toBe(true)
    expect(defaultFor('ROOMS', 'PUSH')).toBe(false)
  })

  test('a channel the type does not use is never delivered on', () => {
    expect(deliversOn(transactional, 'PUSH', [])).toBe(false)
  })

  // The in-app inbox is the record of what happened, so a preference does not empty it.
  test('the inbox is not silenced by a preference', () => {
    expect(deliversOn(onTopic, 'INBOX', allOff)).toBe(true)
  })

  test('a preference cannot be set on a transactional type', () => {
    expect(preferenceIsSettable('account.verify')).toBe(false)
  })
})

describe('per-topic preferences (H-102)', () => {
  // Criterion 1: exactly these five, and the screen is driven by this list rather than a
  // second copy of it.
  test('the topics are exactly the five, in the order the screen shows them', () => {
    expect([...NOTIFICATION_TOPICS]).toEqual(['BOOKINGS', 'SHIFTS', 'TRAINING', 'ROOMS', 'ANNOUNCEMENTS'])
  })

  test('every topic has a label and a description, so no cell renders a raw constant', () => {
    for (const topic of NOTIFICATION_TOPICS) {
      expect(`${topic}: ${Boolean(TOPIC_LABELS[topic])}`).toBe(`${topic}: true`)
      expect(`${topic}: ${Boolean(TOPIC_DESCRIPTIONS[topic])}`).toBe(`${topic}: true`)
    }
  })

  // Criterion 6: anything a preference can silence has to be findable afterwards, so the
  // inbox is not something a type may forget to declare.
  test('every type carrying a topic reaches the inbox as well', () => {
    const missing = Object.entries(MESSAGE_TYPES)
      .filter(([, type]) => type.topic !== null && !(type.channels as readonly string[]).includes('INBOX'))
      .map(([name]) => name)
    expect(missing).toEqual([])
  })

  test('the topic-by-channel matrix has a cell for every topic on both channels', () => {
    const defaults: PreferenceDefaults = { email: [...NOTIFICATION_TOPICS], push: [] }
    for (const topic of NOTIFICATION_TOPICS) {
      expect(`${topic}: ${defaultFor(topic, 'EMAIL', defaults)}`).toBe(`${topic}: true`)
      expect(`${topic}: ${defaultFor(topic, 'PUSH', defaults)}`).toBe(`${topic}: false`)
    }
  })

  // Criterion 2: the defaults are configuration, so a workshop changes them without a release.
  test('the defaults ship as configuration keys, email on and push off', () => {
    expect(CONFIG_KEYS.NOTIFICATION_EMAIL_DEFAULT_TOPICS.default).toEqual([...NOTIFICATION_TOPICS])
    expect(CONFIG_KEYS.NOTIFICATION_PUSH_DEFAULT_TOPICS.default).toEqual([])
  })

  test('a default naming a topic that is not one is refused before it is stored', () => {
    expect(CONFIG_KEYS.NOTIFICATION_EMAIL_DEFAULT_TOPICS.schema.safeParse(['GOSSIP']).success).toBe(false)
    expect(CONFIG_KEYS.NOTIFICATION_EMAIL_DEFAULT_TOPICS.schema.safeParse(['SHIFTS']).success).toBe(true)
  })

  test('the form takes a topic and two switches, and refuses anything else', () => {
    expect(preferenceForm.safeParse({ topic: 'ROOMS', email: false, push: false }).success).toBe(true)
    expect(preferenceForm.safeParse({ topic: 'GOSSIP', email: false, push: false }).success).toBe(false)
    // A transactional type has no topic, so it cannot be named here at all (criterion 5).
    expect(preferenceForm.safeParse({ topic: 'account.verify', email: false, push: false }).success).toBe(false)
    expect(preferenceForm.safeParse({ topic: 'ROOMS', email: 'no', push: false }).success).toBe(false)
  })

  // Criterion 3: suppression is its own outcome in the log, not a skipped-undeliverable row
  // with a note on it.
  test('suppressed-by-preference is a status of its own', () => {
    expect([...NOTIFICATION_STATUSES]).toContain('SUPPRESSED_PREFERENCE')
    expect([...NOTIFICATION_STATUSES]).toContain('SKIPPED_UNDELIVERABLE')
  })

  test('the status registry and the table check say the same thing', async () => {
    const schema = await Bun.file('server/db/schema/notifications.ts').text()
    const check = /notification_log_status.*?IN \(([^)]*)\)/s.exec(schema)?.[1] ?? ''
    const listed = [...check.matchAll(/'([A-Z_]+)'/g)].map(match => match[1])
    expect(listed.sort()).toEqual([...NOTIFICATION_STATUSES].sort())
  })
})

describe('addresses that must never reach the provider (H-107)', () => {
  const live = { email: 'member@gmail.com', anonymisedAt: null }

  test('a real address is deliverable', () => {
    expect(undeliverableReason(live)).toBeNull()
  })

  test('an anonymised account is refused before its address is even considered', () => {
    expect(undeliverableReason({ email: 'member@gmail.com', anonymisedAt: 1 })).toBe('anonymised')
  })

  test('the anonymisation placeholder is refused', () => {
    expect(undeliverableReason({ email: 'deleted-abc123@anonymised.invalid', anonymisedAt: null })).toBe('placeholder-address')
  })

  // The old estate left these in proscenium's customer table (Get-In part 3).
  test('the estate merge placeholder is refused', () => {
    expect(undeliverableReason({ email: 'merged-42@placeholder.invalid', anonymisedAt: null })).toBe('placeholder-address')
  })

  test('reserved and documentation domains are refused', () => {
    for (const email of [
      'a@test.invalid',
      'a@something.test',
      'a@example.com',
      'a@example.org',
      'a@localhost',
      'a@host.localhost',
    ]) {
      expect(`${email}: ${undeliverableReason({ email, anonymisedAt: null })}`).toBe(`${email}: undeliverable-domain`)
    }
  })

  test('a missing or malformed address is refused rather than attempted', () => {
    expect(undeliverableReason({ email: null, anonymisedAt: null })).toBe('no-address')
    expect(undeliverableReason({ email: 'not-an-address', anonymisedAt: null })).toBe('no-address')
  })

  test('the judgement is case-insensitive and ignores surrounding space', () => {
    expect(undeliverableReason({ email: '  Deleted-ABC@Anonymised.Invalid ', anonymisedAt: null })).toBe('placeholder-address')
  })
})
