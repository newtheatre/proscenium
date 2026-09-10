import { z } from 'zod'
import { ROLES } from './roles'

// Admin fan-out with blind copy (H-108): an audience is resolved from live data at send time,
// never a pasted list, and a member cannot see who else the same message reached.

export const AUDIENCE_KINDS = ['ALL_CURRENT_MEMBERS', 'ROLE_HOLDERS', 'TONIGHT_ROTA', 'SESSION_SIGNUPS'] as const
export type AudienceKind = (typeof AUDIENCE_KINDS)[number]

export const audienceDefinition = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ALL_CURRENT_MEMBERS') }),
  z.object({ kind: z.literal('ROLE_HOLDERS'), role: z.enum(ROLES) }),
  z.object({ kind: z.literal('TONIGHT_ROTA') }),
  z.object({ kind: z.literal('SESSION_SIGNUPS'), sessionId: z.string().min(1) }),
])

export type AudienceDefinition = z.output<typeof audienceDefinition>

export const AUDIENCE_LABELS: Record<AudienceKind, string> = {
  ALL_CURRENT_MEMBERS: 'All current members',
  ROLE_HOLDERS: 'Holders of a role',
  TONIGHT_ROTA: 'Tonight\'s rota',
  SESSION_SIGNUPS: 'A session\'s sign-ups',
}

export const composeAnnouncementForm = z.object({
  audience: audienceDefinition,
  subject: z.string().trim().min(1).max(150),
  body: z.string().trim().min(1).max(10_000),
  // A safety notice is a different registered type, not a flag `notify()` reads (H-103
  // criterion 1): the composer's choice only picks which type name is enqueued.
  safetyNotice: z.boolean().default(false),
})

export type ComposeAnnouncementInput = z.output<typeof composeAnnouncementForm>
