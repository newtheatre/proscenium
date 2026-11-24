// A live lesson as the person sees it, with the sections they have reached (O1, TR-40).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { lessonFor } from '../../../../../../lessons'

export default defineRoute({
  ability: 'training.course.view',
  record: event => ['training.course', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, (event, { record, actor }) => lessonFor(actor, record!.id, getRouterParam(event, 'step')!))
