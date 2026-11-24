// The signed-in person confirms they have read a reading step, after opening it (TR-08).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { confirmReading } from '../../../../../../progress'

export default defineRoute({
  ability: 'training.course.view',
  record: event => ['training.course', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}).strict(),
  idempotent: true,
}, async (event, { record, actor, unit }) => confirmReading(unit.view(), actor, record!.id, getRouterParam(event, 'step')!))
