// One scheme for its console screen: its fields, lengths, what opening it still needs, how many
// hold it, and the dates a membership taken today would run to (MEM-01's live example).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { todayOrNull } from '../../../memberships'
import { exampleDates, hasMemberships, lengthOptions, openChecklist, requireScheme } from '../../../schemes'

export default defineRoute({
  ability: 'membership.scheme.view',
  record: event => ['membership.scheme', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => {
  const scheme = await requireScheme(record!.id)
  const options = (await lengthOptions([scheme.id])).get(scheme.id)!
  const day = await todayOrNull()
  return {
    scheme,
    options,
    checklist: await openChecklist(scheme),
    // S2: the side is fixed once any membership exists.
    sideLocked: await hasMemberships(scheme.id),
    example: day ? exampleDates(scheme, options, day) : [],
  }
})
