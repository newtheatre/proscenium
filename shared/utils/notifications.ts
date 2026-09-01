import type { NotificationTopic } from './senders'

// The catalogue every outbound message is typed against (0013, H-101). A type that is not here
// cannot be sent, so nothing goes out untyped.

export const CHANNELS = ['EMAIL', 'INBOX', 'PUSH'] as const
export type Channel = (typeof CHANNELS)[number]

export interface MessageType {
  // A topic carries a preference; transactional messages have none at all, so no path can
  // suppress one (H-103).
  topic: NotificationTopic | null
  channels: readonly Channel[]
  template: string
  // Verification, claim and reset are the only things an unverified address may receive
  // (A-102 criterion 2).
  reachesUnverified?: true
}

export const MESSAGE_TYPES = {
  'account.verify': {
    topic: null,
    channels: ['EMAIL'],
    template: 'account-verify',
    reachesUnverified: true,
  },
  'account.exists': {
    topic: null,
    channels: ['EMAIL'],
    template: 'account-exists',
    reachesUnverified: true,
  },
  'password.reset': {
    topic: null,
    channels: ['EMAIL'],
    template: 'password-reset',
    reachesUnverified: true,
  },
  // A magic link carries no personal information and proves the mailbox by consuming it, which
  // is why it may reach an unverified address (A-107 criterion 3).
  'account.magic-link': {
    topic: null,
    channels: ['EMAIL'],
    template: 'magic-link',
    reachesUnverified: true,
  },
  // An account made from the console has never been seen by its owner, so the first thing it
  // sends must reach an unverified address (A-121 criterion 3).
  'account.set-password': {
    topic: null,
    channels: ['EMAIL'],
    template: 'set-password',
    reachesUnverified: true,
  },
  // A booking is a thing somebody arranged, so it carries the rooms topic and its preference.
  'room.booking.confirmed': {
    topic: 'ROOMS',
    channels: ['EMAIL'],
    template: 'room-booked',
  },
  'room.booking.cancelled': {
    topic: 'ROOMS',
    channels: ['EMAIL'],
    template: 'room-cancelled',
  },
  // Security, so no topic can suppress it, and no reachesUnverified (A-102 criterion 2).
  'account.method-removed': {
    topic: null,
    channels: ['EMAIL'],
    template: 'method-removed',
  },
  // Transactional, so no topic. It does not reach an unverified address, which is what keeps a
  // sweep over ten thousand imported accounts from becoming a bulk send (A-102 criterion 2).
  'membership.expiring': {
    topic: null,
    channels: ['EMAIL'],
    template: 'membership-expiring',
  },
} as const satisfies Record<string, MessageType>

export type MessageTypeName = keyof typeof MESSAGE_TYPES

export function isMessageType(name: string): name is MessageTypeName {
  return Object.hasOwn(MESSAGE_TYPES, name)
}

// Enqueueing an unregistered type is refused rather than sent untyped (H-101 criterion 2).
export function messageType(name: string): MessageType {
  if (!isMessageType(name)) {
    throw new Error(`\`${name}\` is not a registered message type: add it to the catalogue before sending it (H-101)`)
  }
  return MESSAGE_TYPES[name]
}

export function isTransactional(type: MessageType): boolean {
  return type.topic === null
}

export interface Preference {
  topic: NotificationTopic
  email: boolean
  push: boolean
}

// A transactional message ignores every preference; a topic message obeys the one for its
// topic, and an absent preference means yes (0013, H-103).
export function deliversOn(type: MessageType, channel: Channel, preferences: Preference[]): boolean {
  if (!type.channels.includes(channel)) return false
  if (isTransactional(type)) return true
  if (channel === 'INBOX') return true

  const preference = preferences.find(candidate => candidate.topic === type.topic)
  if (!preference) return true
  return channel === 'EMAIL' ? preference.email : preference.push
}

// Setting a preference on a transactional type is a validation error, not a silent no-op
// (H-103 criterion 4).
export function preferenceIsSettable(name: string): boolean {
  return !isTransactional(messageType(name))
}
