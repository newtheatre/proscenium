import { describe, expect, test } from 'bun:test'
import { undeliverableReason } from '#shared/utils/deliverability'
import {
  MESSAGE_TYPES,
  deliversOn,
  isTransactional,
  messageType,
  preferenceIsSettable,
} from '#shared/utils/notifications'
import type { MessageType, Preference } from '#shared/utils/notifications'

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
