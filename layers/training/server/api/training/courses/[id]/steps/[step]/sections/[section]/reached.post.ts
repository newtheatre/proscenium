// The person reaches a section; the last one signs the lesson off and may award (O1, O2, TR-40).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { reachSection } from '../../../../../../../../lessons'

export default defineRoute({
  ability: 'training.course.view',
  record: event => ['training.course', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, (event, { record, actor, unit }) => reachSection(unit.view(), actor, record!.id, getRouterParam(event, 'step')!, getRouterParam(event, 'section')!))
