// Which purposes a bookable allows, and which need approval here (SP-09).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { bookableRow, setBookablePurposes } from '../../../../setup'
import { bookablePurposesInput } from '../../../../inputs'

export default defineRoute({
  ability: 'spaces.bookable.manage',
  record: event => ['spaces.bookable', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: bookablePurposesInput,
}, async (event, { input, unit }) => {
  setBookablePurposes(unit.view(), await bookableRow(getRouterParam(event, 'id')!), input.purposes)
  return { bookableId: getRouterParam(event, 'id') }
})
