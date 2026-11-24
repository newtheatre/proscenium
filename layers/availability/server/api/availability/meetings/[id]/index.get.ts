// S12: the service shows invitees their own answer and the organiser everyone's.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { meetingView } from '../../../../meetings'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) => await meetingView(getRouterParam(event, 'id')!, actor))
