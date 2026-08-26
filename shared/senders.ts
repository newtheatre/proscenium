// The one domain onboarded to Email Service for sending. Every sender address is on it, and
// the worker's send_email binding allows nothing else (0020).
export const SENDING_DOMAIN = 'newtheatre.org.uk'

export interface Sender {
  name: string
  address: string
}

// No address may be a no-reply: a member replying is doing the reasonable thing, so each of
// these needs a real Workspace mailbox behind it (0020).
export const SENDERS = {
  BOX_OFFICE: { name: 'NNT Box Office', address: `boxoffice@${SENDING_DOMAIN}` },
  ROOMS: { name: 'NNT Room Bookings', address: `rooms@${SENDING_DOMAIN}` },
  TRAINING: { name: 'NNT Training', address: `training@${SENDING_DOMAIN}` },
  ACCOUNTS: { name: 'NNT Accounts', address: `accounts@${SENDING_DOMAIN}` },
  ANNOUNCEMENTS: { name: 'The New Theatre', address: `hello@${SENDING_DOMAIN}` },
} as const satisfies Record<string, Sender>

export type SenderKey = keyof typeof SENDERS

// nuxt.config.ts pins the send_email binding to this list, so the binding and the registry
// cannot drift apart.
export const SENDER_ADDRESSES: string[] = Object.values(SENDERS).map(sender => sender.address)

export type NotificationTopic = 'BOOKINGS' | 'SHIFTS' | 'TRAINING' | 'ROOMS' | 'ANNOUNCEMENTS'

// Rota mail has no identity of its own yet and speaks as the theatre; H-101's message
// catalogue assigns senders properly (0020).
const TOPIC_SENDERS: Record<NotificationTopic, SenderKey> = {
  BOOKINGS: 'BOX_OFFICE',
  SHIFTS: 'ANNOUNCEMENTS',
  TRAINING: 'TRAINING',
  ROOMS: 'ROOMS',
  ANNOUNCEMENTS: 'ANNOUNCEMENTS',
}

export function senderForTopic(topic: NotificationTopic): Sender {
  return SENDERS[TOPIC_SENDERS[topic]]
}

// RFC 5322 display-name form, which is what the send_email binding expects as `from`.
export function formatSender(sender: Sender): string {
  return `"${sender.name}" <${sender.address}>`
}
