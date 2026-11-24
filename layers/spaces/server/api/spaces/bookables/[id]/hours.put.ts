// A bookable's week of opening hours, or always open (SP-06).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { bookableRow, setHours } from '../../../../setup'
import { hoursInput } from '../../../../inputs'

export default defineRoute({
  ability: 'spaces.bookable.manage',
  record: event => ['spaces.bookable', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: hoursInput,
}, async (event, { input, unit }) => {
  setHours(unit.view(), await bookableRow(getRouterParam(event, 'id')!), input)
  return { bookableId: getRouterParam(event, 'id') }
})
