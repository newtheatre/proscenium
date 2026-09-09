import { z } from 'zod'

// Severity routing to follow-up (E-116). Nothing here reads a request or the database;
// `server/utils/incident-safety.ts` is where a setting is read and a follow-up is closed.

export const severityConfigForm = z.object({
  requiresFollowUp: z.boolean(),
})

export type SeverityConfigInput = z.output<typeof severityConfigForm>

const RESOLUTION_LIMIT = 2000

export const closeFollowUpForm = z.object({
  resolutionNote: z.string().trim().min(1, 'Say how it was resolved').max(RESOLUTION_LIMIT),
})

export type CloseFollowUpInput = z.output<typeof closeFollowUpForm>
