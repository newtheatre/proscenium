import { z } from 'zod'
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
})

export type NightMessageInput = z.output<typeof nightMessageForm>
