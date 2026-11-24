// The Details tab of a bookable.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { bookableRow, updateBookable } from '../../../../setup'
import { bookableDetails } from '../../../../inputs'

export default defineRoute({
  ability: 'spaces.bookable.manage',
  record: event => ['spaces.bookable', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: bookableDetails,
}, async (event, { input, unit }) => {
  updateBookable(unit.view(), await bookableRow(getRouterParam(event, 'id')!), input)
  return { bookableId: getRouterParam(event, 'id') }
})
