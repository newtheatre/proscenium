import { describe, expect, test } from 'bun:test'
import { MESSAGE_TYPES } from '#shared/utils/notifications'
import { SENDERS, SENDER_ADDRESSES, SENDING_DOMAIN, senderForTopic } from '#shared/utils/senders'
import type { MessageType, MessageTypeName } from '#shared/utils/notifications'
import type { SenderKey } from '#shared/utils/senders'

const TOPICS = ['BOOKINGS', 'SHIFTS', 'TRAINING', 'ROOMS', 'ANNOUNCEMENTS'] as const

// The identity each registered type must go out as, kept by hand so that adding a type without
// deciding its sender fails here rather than quietly landing on the accounts address (0020).
const EXPECTED_SENDERS: Record<MessageTypeName, SenderKey> = {
  'account.verify': 'ACCOUNTS',
  'account.exists': 'ACCOUNTS',
  'password.reset': 'ACCOUNTS',
  'account.magic-link': 'ACCOUNTS',
  'account.set-password': 'ACCOUNTS',
  'account.claim': 'ACCOUNTS',
  'account.method-removed': 'ACCOUNTS',
  'membership.expiring': 'ACCOUNTS',
  'membership.claim.recorded': 'ACCOUNTS',
  'membership.claim.declined': 'ACCOUNTS',
  'role.expiring': 'ACCOUNTS',
  'role.expiry.digest': 'ACCOUNTS',
  'room.booking.confirmed': 'ROOMS',
  'room.request.received': 'ROOMS',
  'room.request.raised': 'ROOMS',
  'room.request.waiting': 'ROOMS',
  'room.request.expired': 'ROOMS',
  'room.request.approved': 'ROOMS',
  'room.request.rejected': 'ROOMS',
  'room.booking.cancelled': 'ROOMS',
  'room.booking.reminder': 'ROOMS',
  'room.series.confirmed': 'ROOMS',
  'room.series.requested': 'ROOMS',
  'room.series.cancelled': 'ROOMS',
  'room.blackout.cancelled': 'ROOMS',
  'room.booking.bumped': 'ROOMS',
  'room.no-show.recorded': 'ROOMS',
  'external.request.received': 'ROOMS',
  'external.request.raised': 'ROOMS',
  'external.request.submitted': 'ROOMS',
  'external.request.assigned': 'ROOMS',
  'external.request.reassigning': 'ROOMS',
  'external.request.rejected': 'ROOMS',
  'external.request.withdrawn': 'ROOMS',
  'external.request.waiting': 'ROOMS',
  'room.request.unlisted': 'ROOMS',
  'external.request.relisted': 'ROOMS',
  'reservation.hold-expiring': 'BOX_OFFICE',
  'reservation.confirmed': 'BOX_OFFICE',
  'reservation.walk-up-paid': 'BOX_OFFICE',
  'reservation.cancelled': 'BOX_OFFICE',
  'pass.issued': 'BOX_OFFICE',
  'waiting-list.joined': 'BOX_OFFICE',
  'waiting-list.offered': 'BOX_OFFICE',
  'shift.performance-cancelled': 'ANNOUNCEMENTS',
  'shift.opening-cancelled': 'ANNOUNCEMENTS',
  'shift.venue-changed': 'ANNOUNCEMENTS',
  'shift.role-not-needed': 'ANNOUNCEMENTS',
  'shift.rota-unstaffed': 'ANNOUNCEMENTS',
  'shift.approved': 'ANNOUNCEMENTS',
  'shift.declined': 'ANNOUNCEMENTS',
  'shift.released': 'ANNOUNCEMENTS',
  'shift.assigned': 'ANNOUNCEMENTS',
  'shift.removed': 'ANNOUNCEMENTS',
  'shift.reminder': 'ANNOUNCEMENTS',
  'incident.follow-up-required': 'ANNOUNCEMENTS',
  'board.reset': 'ANNOUNCEMENTS',
  'docs.drift-reported': 'ACCOUNTS',
  'night.auto-closed': 'ANNOUNCEMENTS',
  'training.request.scheduled': 'TRAINING',
  'training.session.absent': 'TRAINING',
  'training.register.unmarked': 'TRAINING',
  'training.session.promoted': 'TRAINING',
  'training.session.cancelled': 'TRAINING',
  'training.expiry.window': 'TRAINING',
  'training.expiry.final': 'TRAINING',
  'training.expiry.digest': 'TRAINING',
  'admin.announcement': 'ANNOUNCEMENTS',
  'admin.safety-notice': 'ANNOUNCEMENTS',
  'admin.ticket-holders': 'BOX_OFFICE',
  'admin.ticket-holders.safety-notice': 'BOX_OFFICE',
  'digest.bookings': 'BOX_OFFICE',
  'digest.shifts': 'ANNOUNCEMENTS',
  'digest.training': 'TRAINING',
  'digest.rooms': 'ROOMS',
  'digest.announcements': 'ANNOUNCEMENTS',
  'health.alert': 'ACCOUNTS',
  'retention.warning.window': 'ACCOUNTS',
  'retention.warning.final': 'ACCOUNTS',
  'retention.digest': 'ACCOUNTS',
}

// The one expression notify() resolves a `from` with, so this reads the catalogue the way the
// send path does rather than restating the catalogue back to itself.
function resolvedSender(type: MessageType): { name: string, address: string } {
  return type.sender ? SENDERS[type.sender] : type.topic ? senderForTopic(type.topic) : SENDERS.ACCOUNTS
}

describe('sender identities (0020)', () => {
  test('every address is on the one onboarded sending domain', () => {
    for (const [key, sender] of Object.entries(SENDERS)) {
      expect(`${key}: ${sender.address.endsWith(`@${SENDING_DOMAIN}`)}`).toBe(`${key}: true`)
    }
  })

  test('no address is a no-reply', () => {
    for (const [key, sender] of Object.entries(SENDERS)) {
      const local = sender.address.split('@')[0]!.toLowerCase().replace(/[.\-_]/g, '')
      expect(`${key}: ${local.startsWith('noreply') || local.startsWith('donotreply')}`).toBe(`${key}: false`)
    }
  })

  test('every identity has a display name', () => {
    for (const [key, sender] of Object.entries(SENDERS)) {
      expect(`${key}: ${sender.name.trim().length > 0}`).toBe(`${key}: true`)
    }
  })

  test('the address list matches the registry exactly', () => {
    expect([...SENDER_ADDRESSES].sort()).toEqual(Object.values(SENDERS).map(s => s.address).sort())
  })

  test('addresses are unique', () => {
    expect(new Set(SENDER_ADDRESSES).size).toBe(SENDER_ADDRESSES.length)
  })

  // CI builds before it tests, so this always runs there. Locally it reports the skip rather
  // than passing quietly.
  test('the built worker binding allows exactly these addresses', async () => {
    const built = Bun.file('.output/server/wrangler.json')
    if (!await built.exists()) {
      console.warn('[senders] .output/server/wrangler.json absent: run `bun run build` to check the binding')
      return
    }
    const config = await built.json()
    const binding = config.send_email?.find((b: { name: string }) => b.name === 'EMAIL')
    expect(binding).toBeDefined()
    expect([...binding.allowed_sender_addresses].sort()).toEqual([...SENDER_ADDRESSES].sort())
  })

  test('every notification topic resolves to one identity', () => {
    for (const topic of TOPICS) {
      const sender = senderForTopic(topic)
      expect(`${topic}: ${SENDER_ADDRESSES.includes(sender.address)}`).toBe(`${topic}: true`)
    }
  })
})

describe('every message type goes out as a decided identity (H-101)', () => {
  test('the expected map covers the catalogue exactly', () => {
    expect(Object.keys(MESSAGE_TYPES).sort()).toEqual(Object.keys(EXPECTED_SENDERS).sort())
  })

  test('each type resolves to the identity the catalogue decided for it', () => {
    for (const [name, type] of Object.entries(MESSAGE_TYPES)) {
      const expected = SENDERS[EXPECTED_SENDERS[name as MessageTypeName]]
      expect(`${name}: ${resolvedSender(type).address}`).toBe(`${name}: ${expected.address}`)
    }
  })

  // The fallback is for account and platform mail alone: an operational message reaching it is
  // the drift this map exists to catch (0020).
  test('no shift, training or announcement type falls through to the accounts address', () => {
    for (const [name, type] of Object.entries(MESSAGE_TYPES)) {
      if (!/^(shift|training|incident|board|night|admin|digest)\./.test(name)) continue
      expect(`${name}: ${resolvedSender(type).address}`).not.toBe(`${name}: ${SENDERS.ACCOUNTS.address}`)
    }
  })
})
