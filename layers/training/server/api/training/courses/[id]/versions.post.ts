// Starts the next version of a live course, copying its steps (V1).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { startVersion } from '../../../../courses'

export default defineRoute({
  ability: 'training.course.manage',
  record: event => ['training.course', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}).strict(),
  idempotent: true,
}, async (_event, { record, unit }) => ({ versionId: await startVersion(unit.view(), record!.id) }))
