// M3: the organiser changes the time, title, place or agenda.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { changeInput } from '../../../../inputs'
import { change } from '../../../../meetings'

export default defineRoute({ ability: 'availability.meeting.arrange', rateLimit: 'write', idempotent: true, input: changeInput }, async (event, { actor, input, unit }) => await change(unit.view(), getRouterParam(event, 'id')!, actor, input))
