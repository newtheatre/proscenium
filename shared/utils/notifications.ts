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
  'room.request.received': {
    topic: 'ROOMS',
    channels: ['EMAIL'],
    template: 'room-requested',
  },
  // Sent when a request arrives; `waiting` is the later nudge, so an approver can tell a new one
  // from one that has sat unanswered (C-113 criterion 4).
  'room.request.raised': {
    topic: 'ROOMS',
    channels: ['EMAIL'],
    template: 'room-request-raised',
  },
  'room.request.waiting': {
    topic: 'ROOMS',
    channels: ['EMAIL'],
    template: 'room-request-waiting',
  },
  'room.request.expired': {
    topic: 'ROOMS',
    channels: ['EMAIL'],
    template: 'room-request-expired',
  },
  // One message carries every decision taken on one member's requests in one action, so a batch
  // of five is one email rather than five (C-109 criterion 4).
  'room.request.approved': {
    topic: 'ROOMS',
    channels: ['EMAIL'],
    template: 'room-approved',
  },
  'room.request.rejected': {
    topic: 'ROOMS',
    channels: ['EMAIL'],
    template: 'room-rejected',
  },
  'room.booking.cancelled': {
    topic: 'ROOMS',
    channels: ['EMAIL'],
    template: 'room-cancelled',
  },
  // The day before, once, carrying every booking that member holds tomorrow (C-113 criteria 2
  // and 3). The old app had no clockwork at all, so nothing was ever reminded (RM-1).
  'room.booking.reminder': {
    topic: 'ROOMS',
    channels: ['EMAIL'],
    template: 'room-reminder',
  },

  // Asking put it in the diary, which is worth saying: it is the only feedback a request gives.
  'training.request.scheduled': {
    topic: 'TRAINING',
    channels: ['EMAIL'],
    template: 'training-request-scheduled',
  },

  // Blunt, because it is to an officer about a system failure rather than to a member about
  // themselves: until the register is marked, the training did not happen (G-119).
  'training.register.unmarked': {
    topic: 'TRAINING',
    channels: ['EMAIL'],
    template: 'training-register-unmarked',
  },

  // Two warnings at different urgencies, neither suppressing the other (G-125 criterion 1).
  'training.expiry.window': {
    topic: 'TRAINING',
    channels: ['EMAIL'],
    template: 'training-expiry-window',
  },

  'training.expiry.final': {
    topic: 'TRAINING',
    channels: ['EMAIL'],
    template: 'training-expiry-final',
  },

  'training.expiry.digest': {
    topic: 'TRAINING',
    channels: ['EMAIL'],
    template: 'training-expiry-digest',
  },

  // One message for a series, never one per occurrence (C-113 criterion 2).
  'room.series.confirmed': {
    topic: 'ROOMS',
    channels: ['EMAIL'],
    template: 'room-series-booked',
  },
  'room.series.requested': {
    topic: 'ROOMS',
    channels: ['EMAIL'],
    template: 'room-series-requested',
  },
  'room.series.cancelled': {
    topic: 'ROOMS',
    channels: ['EMAIL'],
    template: 'room-series-cancelled',
  },
  // Nobody asked for this one: the room was shut under them, so it leads with the reason.
  'room.blackout.cancelled': {
    topic: 'ROOMS',
    channels: ['EMAIL'],
    template: 'room-blackout-cancelled',
  },
  // Their room was taken for something with a higher claim, so it leads with the reason and
  // what they have instead (C-115 criterion 3).
  'room.booking.bumped': {
    topic: 'ROOMS',
    channels: ['EMAIL'],
    template: 'room-bumped',
  },
  // Sent when the mark changes what booking costs them, not for every mark: a message about
  // nothing teaches people to ignore messages (C-116 criterion 5).
  'room.no-show.recorded': {
    topic: 'ROOMS',
    channels: ['EMAIL'],
    template: 'room-no-show',
  },

  // A third party decides, so the member hears at every step (C-120).
  'external.request.received': { topic: 'ROOMS', channels: ['EMAIL'], template: 'external-received' },
  'external.request.raised': { topic: 'ROOMS', channels: ['EMAIL'], template: 'external-raised' },
  'external.request.submitted': { topic: 'ROOMS', channels: ['EMAIL'], template: 'external-submitted' },
  'external.request.assigned': { topic: 'ROOMS', channels: ['EMAIL'], template: 'external-assigned' },
  'external.request.reassigning': { topic: 'ROOMS', channels: ['EMAIL'], template: 'external-reassigning' },
  'external.request.rejected': { topic: 'ROOMS', channels: ['EMAIL'], template: 'external-rejected' },
  'external.request.withdrawn': { topic: 'ROOMS', channels: ['EMAIL'], template: 'external-withdrawn' },
  'external.request.waiting': { topic: 'ROOMS', channels: ['EMAIL'], template: 'external-waiting' },
  // A move changes what the member holds, so both directions say whether the slot went (C-123).
  'room.request.unlisted': { topic: 'ROOMS', channels: ['EMAIL'], template: 'request-unlisted' },
  'external.request.relisted': { topic: 'ROOMS', channels: ['EMAIL'], template: 'request-relisted' },
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
