import { z } from 'zod'
import type { NotificationTopic, SenderKey } from './senders'

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
  // Overrides the topic-derived sender: for a transactional type that still wants a branded
  // identity rather than the generic accounts address (D-107).
  sender?: SenderKey
}

export const MESSAGE_TYPES = {
  // Module A: identity

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

  // An answer to something the member asked for, so transactional: no topic may suppress it, and
  // the inbox keeps the reason where a declined member can find it again (A-130 criterion 3).
  'membership.claim.recorded': {
    topic: null,
    channels: ['EMAIL', 'INBOX'],
    template: 'membership-claim-recorded',
  },

  'membership.claim.declined': {
    topic: null,
    channels: ['EMAIL', 'INBOX'],
    template: 'membership-claim-declined',
  },

  // A handover is planned rather than discovered, so this is transactional: no topic may
  // suppress the notice that somebody's standing authority is about to end (A-119 criterion 1).
  'role.expiring': {
    topic: null,
    channels: ['EMAIL'],
    template: 'role-expiring',
  },

  // The administrator's monthly view of what is lapsing, what just lapsed and which grants never
  // expire, so the exceptions stay visible (A-119 criteria 2, 3).
  'role.expiry.digest': {
    topic: null,
    channels: ['EMAIL', 'INBOX'],
    template: 'role-expiry-digest',
  },

  // Module C: spaces

  // A booking is a thing somebody arranged, so it carries the rooms topic and its preference.
  'room.booking.confirmed': {
    topic: 'ROOMS',
    channels: ['EMAIL', 'INBOX'],
    template: 'room-booked',
  },

  'room.request.received': {
    topic: 'ROOMS',
    channels: ['EMAIL', 'INBOX'],
    template: 'room-requested',
  },

  // Sent when a request arrives; `waiting` is the later nudge, so an approver can tell a new one
  // from one that has sat unanswered (C-113 criterion 4).
  'room.request.raised': {
    topic: 'ROOMS',
    channels: ['EMAIL', 'INBOX'],
    template: 'room-request-raised',
  },

  'room.request.waiting': {
    topic: 'ROOMS',
    channels: ['EMAIL', 'INBOX'],
    template: 'room-request-waiting',
  },

  'room.request.expired': {
    topic: 'ROOMS',
    channels: ['EMAIL', 'INBOX'],
    template: 'room-request-expired',
  },

  // One message carries every decision taken on one member's requests in one action, so a batch
  // of five is one email rather than five (C-109 criterion 4).
  'room.request.approved': {
    topic: 'ROOMS',
    channels: ['EMAIL', 'INBOX'],
    template: 'room-approved',
  },

  'room.request.rejected': {
    topic: 'ROOMS',
    channels: ['EMAIL', 'INBOX'],
    template: 'room-rejected',
  },

  'room.booking.cancelled': {
    topic: 'ROOMS',
    channels: ['EMAIL', 'INBOX'],
    template: 'room-cancelled',
  },

  // The day before, once, carrying every booking that member holds tomorrow (C-113 criteria 2
  // and 3). The old app had no clockwork at all, so nothing was ever reminded (RM-1).
  'room.booking.reminder': {
    topic: 'ROOMS',
    channels: ['EMAIL', 'INBOX'],
    template: 'room-reminder',
  },

  // One message for a series, never one per occurrence (C-113 criterion 2).
  'room.series.confirmed': {
    topic: 'ROOMS',
    channels: ['EMAIL', 'INBOX'],
    template: 'room-series-booked',
  },

  'room.series.requested': {
    topic: 'ROOMS',
    channels: ['EMAIL', 'INBOX'],
    template: 'room-series-requested',
  },

  'room.series.cancelled': {
    topic: 'ROOMS',
    channels: ['EMAIL', 'INBOX'],
    template: 'room-series-cancelled',
  },

  // Nobody asked for this one: the room was shut under them, so it leads with the reason.
  'room.blackout.cancelled': {
    topic: 'ROOMS',
    channels: ['EMAIL', 'INBOX'],
    template: 'room-blackout-cancelled',
  },

  // Their room was taken for something with a higher claim, so it leads with the reason and
  // what they have instead (C-115 criterion 3).
  'room.booking.bumped': {
    topic: 'ROOMS',
    channels: ['EMAIL', 'INBOX'],
    template: 'room-bumped',
  },

  // Sent when the mark changes what booking costs them, not for every mark: a message about
  // nothing teaches people to ignore messages (C-116 criterion 5).
  'room.no-show.recorded': {
    topic: 'ROOMS',
    channels: ['EMAIL', 'INBOX'],
    template: 'room-no-show',
  },

  // A third party decides, so the member hears at every step (C-120).
  'external.request.received': { topic: 'ROOMS', channels: ['EMAIL', 'INBOX'], template: 'external-received' },

  'external.request.raised': { topic: 'ROOMS', channels: ['EMAIL', 'INBOX'], template: 'external-raised' },

  'external.request.submitted': { topic: 'ROOMS', channels: ['EMAIL', 'INBOX'], template: 'external-submitted' },

  'external.request.assigned': { topic: 'ROOMS', channels: ['EMAIL', 'INBOX'], template: 'external-assigned' },

  'external.request.reassigning': { topic: 'ROOMS', channels: ['EMAIL', 'INBOX'], template: 'external-reassigning' },

  'external.request.rejected': { topic: 'ROOMS', channels: ['EMAIL', 'INBOX'], template: 'external-rejected' },

  'external.request.withdrawn': { topic: 'ROOMS', channels: ['EMAIL', 'INBOX'], template: 'external-withdrawn' },

  'external.request.waiting': { topic: 'ROOMS', channels: ['EMAIL', 'INBOX'], template: 'external-waiting' },

  // A move changes what the member holds, so both directions say whether the slot went (C-123).
  'room.request.unlisted': { topic: 'ROOMS', channels: ['EMAIL', 'INBOX'], template: 'request-unlisted' },

  'external.request.relisted': { topic: 'ROOMS', channels: ['EMAIL', 'INBOX'], template: 'request-relisted' },

  // Module D: ticketing

  // Transactional (D-107 criterion 3): a guest holds nobody's preferences to read, and this is
  // what they typed their address in for. Reaches an unverified account, which every guest is.
  'reservation.hold-expiring': {
    topic: null,
    channels: ['EMAIL'],
    template: 'reservation-hold-expiring',
    reachesUnverified: true,
    sender: 'BOX_OFFICE',
  },

  // Transactional (the booking exists because of this message, not despite a preference), and
  // reaches an unverified account, which every guest is (D-108 criterion 2).
  'reservation.confirmed': {
    topic: null,
    channels: ['EMAIL'],
    template: 'reservation-confirmed',
    reachesUnverified: true,
    sender: 'BOX_OFFICE',
  },

  // Transactional, same reach as the confirmation it undoes (D-110 criterion 3).
  'reservation.cancelled': {
    topic: null,
    channels: ['EMAIL'],
    template: 'reservation-cancelled',
    reachesUnverified: true,
    sender: 'BOX_OFFICE',
  },

  // Transactional (the pass exists because of this message, not despite a preference), reaching
  // an unverified account the same way a reservation confirmation does (D-124 criterion 5).
  'pass.issued': {
    topic: null,
    channels: ['EMAIL'],
    template: 'pass-issued',
    reachesUnverified: true,
    sender: 'BOX_OFFICE',
  },

  // Transactional and reaches an unverified account: a guest joined with an address nobody has
  // proven, the same reach a reservation confirmation gets (D-113 criterion 1).
  'waiting-list.joined': {
    topic: null,
    channels: ['EMAIL'],
    template: 'waiting-list-joined',
    reachesUnverified: true,
    sender: 'BOX_OFFICE',
  },

  // Transactional: a preference cannot silence the one message that tells somebody a seat is
  // theirs to claim before it lapses to the next entry (D-113 criterion 2).
  'waiting-list.offered': {
    topic: null,
    channels: ['EMAIL'],
    template: 'waiting-list-offered',
    reachesUnverified: true,
    sender: 'BOX_OFFICE',
  },

  // Module E: show night

  // Transactional, so no rota preference can silence it: somebody who turned shift email off
  // would otherwise turn up to a performance that is not happening (E-102 criterion 4).
  'shift.performance-cancelled': {
    topic: null,
    channels: ['EMAIL'],
    template: 'shift-performance-cancelled',
  },
  // Transactional for the same reason: a held shift moved with the performance, and the holder
  // needs to know before the night rather than at the door (E-102, venue move interpretation).
  'shift.venue-changed': {
    topic: null,
    channels: ['EMAIL'],
    template: 'shift-venue-changed',
  },
  // The new venue does not staff this role at all, so the shift went rather than moved.
  'shift.role-not-needed': {
    topic: null,
    channels: ['EMAIL'],
    template: 'shift-role-not-needed',
  },
  // Transactional: an officer administering the rota must not be able to mute the one warning
  // that a duty manager gap makes the night unable to run legally (E-108 criterion 2).
  'shift.rota-unstaffed': {
    topic: null,
    channels: ['EMAIL'],
    template: 'shift-rota-unstaffed',
  },
  // Transactional: the claim was theirs, so the decision is not a preference to silence
  // (E-105 criterion 3).
  'shift.approved': {
    topic: null,
    channels: ['EMAIL'],
    template: 'shift-approved',
  },
  'shift.declined': {
    topic: null,
    channels: ['EMAIL'],
    template: 'shift-declined',
  },
  // Transactional: chasing an unstaffed slot ahead of the night is operational, not a
  // preference an officer administering the rota can switch off (E-107 criterion 2).
  'shift.released': {
    topic: null,
    channels: ['EMAIL'],
    template: 'shift-released',
  },
  // The officer's assignment is confirmed by definition, so it reads exactly like an approval
  // to the person it lands on (E-107 criterion 3).
  'shift.assigned': {
    topic: null,
    channels: ['EMAIL'],
    template: 'shift-assigned',
  },
  'shift.removed': {
    topic: null,
    channels: ['EMAIL'],
    template: 'shift-removed',
  },
  // The one shift message that is a courtesy rather than an outcome, so it carries the shifts
  // topic rather than going out regardless of preference (E-109 criterion 4).
  'shift.reminder': {
    topic: 'SHIFTS',
    channels: ['EMAIL', 'INBOX'],
    template: 'shift-reminder',
  },
  // Transactional: a serious incident is not a preference a safety officer may mute (E-116
  // criterion 2).
  'incident.follow-up-required': {
    topic: null,
    channels: ['EMAIL'],
    template: 'incident-follow-up-required',
  },
  // Says a reset happened, never the new code, which travels by voice only (E-122 criterion 2).
  'board.reset': {
    topic: null,
    channels: ['EMAIL'],
    template: 'board-reset',
  },
  // Drift is a defect, not a chore, so it is transactional like an incident's follow-up rather
  // than a preference the IT Manager could mute (J-109 criterion 4).
  'docs.drift-reported': {
    topic: null,
    channels: ['EMAIL'],
    template: 'docs-drift-reported',
  },
  // An unclosed night is a visible event, not a silent repair (E-125 criterion 3): transactional
  // like `shift.rota-unstaffed`, the officer's own precedent, never a preference to mute.
  'night.auto-closed': {
    topic: null,
    channels: ['EMAIL'],
    template: 'night-auto-closed',
  },

  // Module F: bar

  // Module G: training

  // Asking put it in the diary, which is worth saying: it is the only feedback a request gives.
  'training.request.scheduled': {
    topic: 'TRAINING',
    channels: ['EMAIL', 'INBOX'],
    template: 'training-request-scheduled',
  },

  // Nothing has been held against them and nothing has been taken away: the module is simply
  // still outstanding, and the schedule is the way out of that.
  'training.session.absent': {
    topic: 'TRAINING',
    channels: ['EMAIL', 'INBOX'],
    template: 'training-session-absent',
  },

  // Blunt, because it is to an officer about a system failure rather than to a member about
  // themselves: until the register is marked, the training did not happen (G-119).
  'training.register.unmarked': {
    topic: 'TRAINING',
    channels: ['EMAIL', 'INBOX'],
    template: 'training-register-unmarked',
  },

  // Transactional, so no training preference can silence it: somebody who turned training email
  // off would otherwise lose a place they were never told they had (G-106 criterion 5).
  'training.session.promoted': {
    topic: null,
    channels: ['EMAIL'],
    template: 'training-session-promoted',
  },

  // Transactional, so no preference can silence it: the alternative to hearing this is a locked
  // door on the night (G-113 criterion 4).
  'training.session.cancelled': {
    topic: null,
    channels: ['EMAIL'],
    template: 'training-session-cancelled',
  },

  // Two warnings at different urgencies, neither suppressing the other (G-125 criterion 1).
  'training.expiry.window': {
    topic: 'TRAINING',
    channels: ['EMAIL', 'INBOX'],
    template: 'training-expiry-window',
  },

  'training.expiry.final': {
    topic: 'TRAINING',
    channels: ['EMAIL', 'INBOX'],
    template: 'training-expiry-final',
  },

  'training.expiry.digest': {
    topic: 'TRAINING',
    channels: ['EMAIL', 'INBOX'],
    template: 'training-expiry-digest',
  },

  // Module H: communications

  // An officer's fan-out to a resolved audience (H-108). Carries the committee-announcements
  // topic, so a member who muted announcements is not reached by this one.
  'admin.announcement': {
    topic: 'ANNOUNCEMENTS',
    channels: ['EMAIL', 'INBOX'],
    template: 'admin-announcement',
  },

  // The same composer, flagged transactional at the type level rather than at the call site
  // (H-103 criterion 1, H-108 criterion 3): a safety notice reaches its audience regardless.
  'admin.safety-notice': {
    topic: null,
    channels: ['EMAIL', 'INBOX'],
    template: 'admin-announcement',
  },

  // One per topic, never coalesced itself: `topic: null` keeps a digest out of `notify()`'s own
  // hold branch, and no INBOX channel, since those entries already went out individually (H-104).
  'digest.bookings': { topic: null, channels: ['EMAIL'], template: 'notification-digest', sender: 'BOX_OFFICE' },
  'digest.shifts': { topic: null, channels: ['EMAIL'], template: 'notification-digest', sender: 'ANNOUNCEMENTS' },
  'digest.training': { topic: null, channels: ['EMAIL'], template: 'notification-digest', sender: 'TRAINING' },
  'digest.rooms': { topic: null, channels: ['EMAIL'], template: 'notification-digest', sender: 'ROOMS' },
  'digest.announcements': { topic: null, channels: ['EMAIL'], template: 'notification-digest', sender: 'ANNOUNCEMENTS' },

  // Module I: finance

  // Module J: governance

  // No topic: a deploy nobody can turn off must still reach the IT Manager (J-106 criterion 5).
  'health.alert': {
    topic: null,
    channels: ['EMAIL', 'INBOX'],
    template: 'health-alert',
  },

  // Module K: platform

  // No topic: an account approaching anonymisation is not something a preference silences
  // (K-111, 0011).
  'retention.warning.window': {
    topic: null,
    channels: ['EMAIL'],
    template: 'retention-warning-window',
  },

  'retention.warning.final': {
    topic: null,
    channels: ['EMAIL'],
    template: 'retention-warning-final',
  },

  'retention.digest': {
    topic: null,
    channels: ['EMAIL', 'INBOX'],
    template: 'retention-digest',
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

// `topic: null` means a deadline a digest interval would eat (a hold, an offer), so transactional
// never coalesces; a claim or an attachment bypass it for their own reasons (H-104, 0061).
export function joinsDigest(type: MessageType, hasClaim: boolean, hasAttachment: boolean): boolean {
  return !hasClaim && !isTransactional(type) && !hasAttachment
}

export interface Preference {
  topic: NotificationTopic
  email: boolean
  push: boolean
}

// The five topics, in the order the preference screen shows them. Changing the list is a
// migration, not a setting: the topic check is on the table (0025, H-102 criterion 1).
export const NOTIFICATION_TOPICS = ['BOOKINGS', 'SHIFTS', 'TRAINING', 'ROOMS', 'ANNOUNCEMENTS'] as const satisfies readonly NotificationTopic[]

// The one registered digest type per topic, and the noun a coalesced subject line names
// (H-104 criterion 1).
export const DIGEST_TYPE_FOR_TOPIC: Record<NotificationTopic, MessageTypeName> = {
  BOOKINGS: 'digest.bookings',
  SHIFTS: 'digest.shifts',
  TRAINING: 'digest.training',
  ROOMS: 'digest.rooms',
  ANNOUNCEMENTS: 'digest.announcements',
}

export const DIGEST_TOPIC_NOUN: Record<NotificationTopic, string> = {
  BOOKINGS: 'booking update',
  SHIFTS: 'shift update',
  TRAINING: 'training update',
  ROOMS: 'room booking update',
  ANNOUNCEMENTS: 'announcement',
}

// Every outcome a send-log row may hold. The status carries the outcome; `error` carries the
// provider's own words where there are any (H-102 criterion 3, H-105 criterion 1).
export const NOTIFICATION_STATUSES = [
  'PENDING',
  'SENT',
  'FAILED',
  'RETRYING',
  'FAILED_FINAL',
  'SUPPRESSED_PREFERENCE',
  'SKIPPED_UNDELIVERABLE',
] as const

export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number]

// Nothing retries these: a send either arrived, or was refused before a provider saw it, or has
// run out of attempts. `FAILED` and `RETRYING` are the two the retry machinery owns (H-105).
export const TERMINAL_STATUSES = [
  'SENT',
  'FAILED_FINAL',
  'SUPPRESSED_PREFERENCE',
  'SKIPPED_UNDELIVERABLE',
] as const satisfies readonly NotificationStatus[]

export function isTerminal(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status)
}

// Doubling from the first failure, computed from the enqueue time and the attempt count rather
// than stored, so a due time cannot disagree with the attempts beside it (H-105 criterion 2).
export function retryDueAt(createdAt: number, attempts: number, backoffMinutes: number): number {
  return createdAt + backoffMinutes * 60 * (2 ** attempts - 1)
}

// A send that has run out of attempts is failed for good; one with attempts left waits for the
// next sweep. The first attempt counts, so a maximum of one means no retry at all.
export function outOfAttempts(attempts: number, maxAttempts: number): boolean {
  return attempts >= maxAttempts
}

// The same approximation the retention threshold uses, where a year is 365.25 days.
export function logRetentionCutoff(nowEpoch: number, months: number): number {
  return nowEpoch - Math.round(months * (365.25 / 12) * 86_400)
}

export const TOPIC_LABELS: Record<NotificationTopic, string> = {
  BOOKINGS: 'Bookings',
  SHIFTS: 'Shifts',
  TRAINING: 'Training',
  ROOMS: 'Room bookings',
  ANNOUNCEMENTS: 'Committee announcements',
}

// What each topic actually covers, so a member switching one off knows what goes quiet.
export const TOPIC_DESCRIPTIONS: Record<NotificationTopic, string> = {
  BOOKINGS: 'Changes to shows you have tickets for, and reminders before a performance.',
  SHIFTS: 'Rota reminders, and news about a shift you hold or asked for.',
  TRAINING: 'Session places, register marks and training that is running out.',
  ROOMS: 'Room requests and bookings, yours and any you approve.',
  ANNOUNCEMENTS: 'Announcements from the committee to the membership.',
}

// Which topics a new account starts switched on for, per channel: configuration, so a workshop
// can change it without a release (H-102 criterion 2).
export interface PreferenceDefaults {
  email: readonly NotificationTopic[]
  push: readonly NotificationTopic[]
}

// A topic with no stored row falls to the configured default rather than to an assumed yes.
export function defaultFor(topic: NotificationTopic, channel: 'EMAIL' | 'PUSH', defaults?: PreferenceDefaults): boolean {
  if (!defaults) return channel === 'EMAIL'
  return (channel === 'EMAIL' ? defaults.email : defaults.push).includes(topic)
}

// A transactional message ignores every preference; a topic message obeys the one for its
// topic, and a topic with no row falls to its configured default (0013, H-102, H-103).
export function deliversOn(type: MessageType, channel: Channel, preferences: Preference[], defaults?: PreferenceDefaults): boolean {
  if (!type.channels.includes(channel)) return false
  if (isTransactional(type)) return true
  // The inbox is the backstop for anything a preference can silence, so switching email off
  // never makes a message unfindable (H-102 criterion 6).
  if (channel === 'INBOX') return true

  const preference = preferences.find(candidate => candidate.topic === type.topic)
  if (!preference) return defaultFor(type.topic!, channel, defaults)
  return channel === 'EMAIL' ? preference.email : preference.push
}

// One topic's row as the screen sends it back. A transactional type has no topic and so cannot
// appear here at all, which is what keeps a preference from suppressing one (H-103 criterion 4).
export const preferenceForm = z.object({
  topic: z.enum(NOTIFICATION_TOPICS),
  email: z.boolean(),
  push: z.boolean(),
})

export type PreferenceInput = z.infer<typeof preferenceForm>

// Setting a preference on a transactional type is a validation error, not a silent no-op
// (H-103 criterion 4).
export function preferenceIsSettable(name: string): boolean {
  return !isTransactional(messageType(name))
}
