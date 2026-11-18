// Chooses the seating layout a performance uses. Its wheelchair spaces become the layout's, and a
// performance sold as one part of the house takes the layout's seats too.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute, idSchema, refuse } from '#kit'
import { applyLayout, getLayout } from '../../../../layouts'

export default defineRoute({
  ability: 'box-office.performance.manage',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({ layoutId: idSchema('lay') }).strict(),
}, async (_event, { input, record, unit }) => {
  const layout = await getLayout(input.layoutId)
  if (!layout) refuse('box-office.layout.not-found', 'There is no such seating layout.', { status: 422, fields: { layoutId: 'Choose a layout from the list.' } })
  await applyLayout(unit.view(), record!.id, layout, { seats: true })
  return { layoutId: layout.id }
})
