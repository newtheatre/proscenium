// What changing whether the theatre runs a space would touch (R-36), from every module's
// core.change-impact, for the confirmation before it is saved. Modules may warn here; none may refuse.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { getSpace } from '../../../../../../places/service'
import { changeImpact } from '../../../../../../programme/performances'

export default defineRoute({
  ability: 'core.venue.manage',
  record: event => ['core.venue', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'default',
  input: z.object({ managed: z.enum(['true', 'false']).transform(v => v === 'true') }),
}, async (event, { record, actor, input }) => {
  const space = await getSpace(getRouterParam(event, 'space', { decode: true }) ?? '')
  if (!space || space.venueId !== record!.id) return { lines: [] }
  return { lines: await changeImpact({ record: { type: 'core.space', id: space.id }, kind: 'space.managed', to: { managed: input.managed } }, actor) }
})
