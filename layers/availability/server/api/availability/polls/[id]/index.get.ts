// S8 for the organiser, S9 for a person asked: the service decides what each may see (F7).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { pollView } from '../../../../polls'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) => await pollView(getRouterParam(event, 'id')!, actor))
