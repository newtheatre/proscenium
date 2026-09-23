import { z } from 'zod'
import { ROLES } from './roles'
import type { MessageTypeName } from './notifications'
import { plural } from './text'

// Admin fan-out with blind copy (H-108): an audience is resolved from live data at send time,
// never a pasted list, and a member cannot see who else the same message reached.

export const AUDIENCE_KINDS = [
  'ALL_CURRENT_MEMBERS',
  'ROLE_HOLDERS',
  'TONIGHT_ROTA',
  'SESSION_SIGNUPS',
  'PERFORMANCE_TICKET_HOLDERS',
  'SHOW_TICKET_HOLDERS',
] as const
export type AudienceKind = (typeof AUDIENCE_KINDS)[number]

export const audienceDefinition = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ALL_CURRENT_MEMBERS') }),
  z.object({ kind: z.literal('ROLE_HOLDERS'), role: z.enum(ROLES) }),
  z.object({ kind: z.literal('TONIGHT_ROTA') }),
  z.object({ kind: z.literal('SESSION_SIGNUPS'), sessionId: z.string().min(1, 'Say which session you mean') }),
  z.object({ kind: z.literal('PERFORMANCE_TICKET_HOLDERS'), performanceId: z.string().min(1, 'Say which performance you mean') }),
  z.object({ kind: z.literal('SHOW_TICKET_HOLDERS'), showId: z.string().min(1, 'Say which show you mean') }),
])

export type AudienceDefinition = z.output<typeof audienceDefinition>

export const AUDIENCE_LABELS: Record<AudienceKind, string> = {
  ALL_CURRENT_MEMBERS: 'All current members',
  ROLE_HOLDERS: 'Holders of a role',
  TONIGHT_ROTA: 'Tonight\'s rota',
  SESSION_SIGNUPS: 'A session\'s sign-ups',
  PERFORMANCE_TICKET_HOLDERS: 'Ticket holders for a performance',
  SHOW_TICKET_HOLDERS: 'Ticket holders for a show',
}

export function isTicketHolderAudience(kind: AudienceKind): boolean {
  return kind === 'PERFORMANCE_TICKET_HOLDERS' || kind === 'SHOW_TICKET_HOLDERS'
}

// A ticket holder is told about a booking, not addressed as a member, so the audience picks
// the type and the safety tick only picks between two (0089).
export function announcementType(audience: AudienceDefinition, safetyNotice: boolean): MessageTypeName {
  if (isTicketHolderAudience(audience.kind)) return safetyNotice ? 'admin.ticket-holders.safety-notice' : 'admin.ticket-holders'
  return safetyNotice ? 'admin.safety-notice' : 'admin.announcement'
}

// The audience as a query string, so a count can be read before a word of the message exists
// (H-108 criterion 7). The same definition the resolver takes comes back out of it.
export const audienceFromQuery = z.object({
  kind: z.enum(AUDIENCE_KINDS),
  role: z.enum(ROLES).optional(),
  sessionId: z.string().trim().min(1).optional(),
  performanceId: z.string().trim().min(1).optional(),
  showId: z.string().trim().min(1).optional(),
}).transform((asked, context) => {
  const parsed = audienceDefinition.safeParse(asked)
  if (!parsed.success) {
    context.addIssue({ code: 'custom', message: 'Say who the announcement is for' })
    return z.NEVER
  }
  return parsed.data
})

// A show for the ticket-holder audiences, carrying its run so a performance is picked from it.
export interface AnnounceShowOption {
  id: string
  title: string
  performances: { id: string, startsAt: number, status: string, venueName: string }[]
}

// What the composer says about an audience before anything is written.
export function saysAudienceCount(count: number): string {
  return count === 0 ? 'Nobody is in this audience' : `${plural(count, 'person', 'people')} will get this`
}

// Held means the send log has nothing to show yet, so saying sent would send an officer looking
// for rows that only appear with the next digest (0061).
export function saysAnnouncementSent(count: number, held: number): string {
  return `${held > 0 ? 'Queued for' : 'Sent to'} ${plural(count, 'recipient')}`
}

export const composeAnnouncementForm = z.object({
  audience: audienceDefinition,
  subject: z.string().trim().min(1, 'Give it a subject').max(150),
  body: z.string().trim().min(1, 'Say what the announcement is about').max(10_000),
  // A safety notice is a different registered type, not a flag `notify()` reads (H-103
  // criterion 1): the composer's choice only picks which type name is enqueued.
  safetyNotice: z.boolean().default(false),
})

export type ComposeAnnouncementInput = z.output<typeof composeAnnouncementForm>
