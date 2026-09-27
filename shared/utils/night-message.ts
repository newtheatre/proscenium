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

// One copy of one draft to one person: the claim a retry of the same draft finds already held.
export function nightMessageClaim(draftKey: string, userId: string): string {
  return `night-message:${draftKey}:${userId}`
}

// A retry of a draft everyone already has reaches nobody, and says so rather than "Sent to 0".
export function saysNightMessageSent(count: number): string {
  return count === 0 ? 'Everyone in this audience already has it' : `Sent to ${plural(count, 'person', 'people')}`
}

export type NightMessageInput = z.output<typeof nightMessageForm>
