// Verifies a certificate or approves a declaration (E1): the sign-off, and any award, in one unit.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { verifyEvidence } from '../../../../evidence'

export default defineRoute({
  ability: 'training.evidence.verify',
  record: event => ['training.evidence', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (_event, { record, actor, unit }) => verifyEvidence(unit.view(), actor, record!.id))
