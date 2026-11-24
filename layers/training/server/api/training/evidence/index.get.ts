// The evidence queue (K9; TR-47): certificates and declarations waiting, oldest first, on the
// courses where the signed-in person checks evidence.
import { getQuery } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { evidenceQueue } from '../../../evidence'

const query = z.object({ kind: z.enum(['certificate', 'declaration']).optional(), courseId: z.string().optional() })

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
}, async (event, { actor }) => ({ evidence: await evidenceQueue(actor, query.parse(getQuery(event))) }))
