import { z } from 'zod'
import { plural } from './text'
import type { MessageTypeName } from './notifications'

// Tonight's duty manager messages one of tonight's performances (0101, issue 1327). Nothing here
// reads a request or the database; `server/utils/night-message.ts` resolves and sends.

export const NIGHT_AUDIENCES = ['TICKET_HOLDERS', 'ROTA'] as const
export type NightAudience = (typeof NIGHT_AUDIENCES)[number]

export const NIGHT_AUDIENCE_LABELS: Record<NightAudience, string> = {
  TICKET_HOLDERS: 'Ticket holders',
  ROTA: 'Tonight\'s rota',
}

// At once, whatever the preference: a message about tonight that waits for the next digest has
// missed the night it was about (0101). The types are the announce composer's own (0089).
export function nightMessageType(audience: NightAudience): MessageTypeName {
  return audience === 'TICKET_HOLDERS' ? 'admin.ticket-holders.safety-notice' : 'admin.safety-notice'
}

export const nightAudienceAsked = z.object({
  performanceId: z.string().trim().min(1, 'Say which performance you mean'),
  audience: z.enum(NIGHT_AUDIENCES),
})

export const nightMessageForm = nightAudienceAsked.extend({
  subject: z.string().trim().min(1, 'Give it a subject').max(150),
  body: z.string().trim().min(1, 'Say what the message is about').max(10_000),
  // Made by the page and renewed with every change, so Send pressed again after a dropped
  // connection reaches only those not yet reached (0048).
  draftKey: z.uuid(),
})

// Every copy of one draft from one sender, so a retry takes over only its own claims (0108).
export function nightMessageDraftPrefix(draftKey: string, senderId: string): string {
  return `night-message:${draftKey}:${senderId}:`
}

// One copy of one draft to one person: the claim a retry of the same draft finds already held.
export function nightMessageClaim(draftKey: string, senderId: string, userId: string): string {
  return `${nightMessageDraftPrefix(draftKey, senderId)}${userId}`
}

// A claim younger than this may still be sending, so a retry leaves it alone (0108).
export const NIGHT_MESSAGE_TAKEOVER_SECONDS = 30

export interface NightMessageOutcome {
  count: number
  alreadyOut: number
  resent: number
  stillSending: number
}

// A retry of a draft everyone already has reaches nobody, and says so rather than "Sent to 0".
export function saysNightMessageSent(outcome: NightMessageOutcome): string {
  const parts: string[] = []
  if (outcome.count > 0) parts.push(`Sent to ${plural(outcome.count, 'person', 'people')}`)
  else if (outcome.stillSending === 0) parts.push('Everyone in this audience already has it')
  if (outcome.resent > 0) parts.push(`${plural(outcome.resent, 'copy', 'copies')} resent after an interrupted send`)
  if (outcome.alreadyOut > 0) parts.push(`${plural(outcome.alreadyOut, 'copy', 'copies')} already out`)
  if (outcome.stillSending > 0) parts.push(`${plural(outcome.stillSending, 'copy is', 'copies are')} still being sent; try again in a minute`)
  return parts.join('; ')
}

export type NightMessageInput = z.output<typeof nightMessageForm>
