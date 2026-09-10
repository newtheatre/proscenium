import { describe, expect, test } from 'bun:test'
import { undeliverableReason } from '#shared/utils/deliverability'
import {
  DIGEST_TOPIC_NOUN,
  DIGEST_TYPE_FOR_TOPIC,
  MESSAGE_TYPES,
  NOTIFICATION_STATUSES,
  NOTIFICATION_TOPICS,
  TERMINAL_STATUSES,
  TOPIC_DESCRIPTIONS,
  TOPIC_LABELS,
  defaultFor,
  deliversOn,
  isTerminal,
  isTransactional,
  joinsDigest,
  logRetentionCutoff,
  messageType,
  outOfAttempts,
  preferenceForm,
  preferenceIsSettable,
  retryDueAt,
} from '#shared/utils/notifications'
import { CONFIG_KEYS, DIGEST_WINDOW_KEY } from '#shared/utils/config'
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

  test('the status registry and the table check say the same thing (H-105)', async () => {
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

describe('the send log retries with backoff (H-105)', () => {
  const HOUR = 3600

  // Criterion 2: the wait doubles, and it is computed from the enqueue time and the attempts so
  // no stored due time can disagree with the count beside it.
  test('the wait doubles from the first failure', () => {
    const enqueued = 1_000_000
    expect(retryDueAt(enqueued, 1, 10)).toBe(enqueued + 10 * 60)
    expect(retryDueAt(enqueued, 2, 10)).toBe(enqueued + 30 * 60)
    expect(retryDueAt(enqueued, 3, 10)).toBe(enqueued + 70 * 60)
    expect(retryDueAt(enqueued, 4, 10)).toBe(enqueued + 150 * 60)
  })

  // The shipped values, said out loud once: five attempts over about two and a half hours.
  test('the shipped values give up about two and a half hours after enqueue', () => {
    const window = retryDueAt(0, CONFIG_KEYS.NOTIFICATION_MAX_ATTEMPTS.default - 1, CONFIG_KEYS.NOTIFICATION_RETRY_BACKOFF_MINUTES.default)
    expect(window).toBeGreaterThan(2 * HOUR)
    expect(window).toBeLessThan(3 * HOUR)
  })

  test('nothing waits when the first attempt was also the last', () => {
    expect(retryDueAt(500, 0, 10)).toBe(500)
  })

  // The first attempt counts, so a maximum of one is a system with no retries at all.
  test('a maximum of one attempt means no retry', () => {
    expect(outOfAttempts(1, 1)).toBe(true)
    expect(outOfAttempts(1, 5)).toBe(false)
    expect(outOfAttempts(5, 5)).toBe(true)
    expect(outOfAttempts(6, 5)).toBe(true)
  })

  // Criterion 2: an exhausted entry is failed for good, and criterion 3: nothing else may edit
  // an outcome, so what counts as settled has to be stated somewhere both can read.
  test('the terminal statuses are the ones no sweep may pick up again', () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual(['FAILED_FINAL', 'SENT', 'SKIPPED_UNDELIVERABLE', 'SUPPRESSED_PREFERENCE'])
    expect(isTerminal('FAILED')).toBe(false)
    expect(isTerminal('RETRYING')).toBe(false)
    expect(isTerminal('PENDING')).toBe(false)
    expect(isTerminal('FAILED_FINAL')).toBe(true)
  })

  test('failed-final is a status of its own, and the table accepts it', () => {
    expect([...NOTIFICATION_STATUSES]).toContain('FAILED_FINAL')
  })

  // Criterion 5: the period is configuration and the sweep reads it, so a change is a settings
  // change rather than a release.
  test('the retention cutoff is a whole period back from now', () => {
    const now = 1_700_000_000
    const cutoff = logRetentionCutoff(now, 24)
    expect(now - cutoff).toBe(Math.round(24 * (365.25 / 12) * 86_400))
    expect(logRetentionCutoff(now, 1)).toBeGreaterThan(cutoff)
  })

  test('the retention period ships as a configured number of months', () => {
    expect(CONFIG_KEYS.NOTIFICATION_LOG_RETENTION_MONTHS.default).toBe(24)
  })
})

describe('digest coalescing (H-104)', () => {
  // Criterion 1: every topic that can hold a message has somewhere for the sweep to send it.
  test('every topic has a registered digest type and a noun for its subject line', () => {
    for (const topic of NOTIFICATION_TOPICS) {
      expect(`${topic}: ${Boolean(DIGEST_TYPE_FOR_TOPIC[topic])}`).toBe(`${topic}: true`)
      expect(`${topic}: ${Boolean(DIGEST_TOPIC_NOUN[topic])}`).toBe(`${topic}: true`)
    }
  })

  // A digest that could itself be held would never send: it has to be transactional and
  // email-only, since the inbox entries it covers already went out individually.
  test('every digest type is transactional and carries no topic of its own', () => {
    for (const topic of NOTIFICATION_TOPICS) {
      const type = messageType(DIGEST_TYPE_FOR_TOPIC[topic])
      expect(isTransactional(type)).toBe(true)
      expect([...type.channels]).toEqual(['EMAIL'])
    }
  })

  // The general test, not the specific answer: transactional never coalesces, whatever a future
  // type is about, because topic: null is what marks a deadline a digest window would eat.
  test('a transactional type never joins a digest, unclaimed and attachment-free or not', () => {
    expect(joinsDigest(transactional, false, false)).toBe(false)
    expect(joinsDigest(transactional, true, false)).toBe(false)
    expect(joinsDigest(transactional, false, true)).toBe(false)
  })

  // A hold expiring and an offer lapsing are exactly this shape: one person, one seat, a
  // countdown a digest interval would consume, which is why both ship transactional.
  test('a hold-expiring reminder and a reservation confirmation are both exempt', () => {
    expect(isTransactional(messageType('reservation.hold-expiring'))).toBe(true)
    expect(isTransactional(messageType('reservation.confirmed'))).toBe(true)
    expect(joinsDigest(messageType('reservation.hold-expiring'), false, false)).toBe(false)
  })

  test('an unclaimed, attachment-free, topic-bearing type does join', () => {
    expect(joinsDigest(onTopic, false, false)).toBe(true)
  })

  test('a claim or an attachment bypasses the hold even on a topic-bearing type', () => {
    expect(joinsDigest(onTopic, true, false)).toBe(false)
    expect(joinsDigest(onTopic, false, true)).toBe(false)
  })

  test('the digest window ships as sixty minutes for every topic', () => {
    for (const topic of NOTIFICATION_TOPICS) {
      expect(CONFIG_KEYS[DIGEST_WINDOW_KEY[topic]].default).toBe(60)
    }
  })

  test('the digest table check and the topic registry say the same thing', async () => {
    const schema = await Bun.file('server/db/schema/notifications.ts').text()
    const check = /notification_digest_entries_topic.*?IN \(([^)]*)\)/s.exec(schema)?.[1] ?? ''
    const listed = [...check.matchAll(/'([A-Z_]+)'/g)].map(match => match[1])
    expect(listed.sort()).toEqual([...NOTIFICATION_TOPICS].sort())
  })
})
