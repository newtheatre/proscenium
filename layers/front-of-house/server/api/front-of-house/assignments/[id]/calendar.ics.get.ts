// One place on a shift as a calendar file (SU-8, EM-4). The link in a confirmation email and the
// "Add to calendar" button carry a key only the server can make for this place, so no sign-in is
// needed and the link opens nothing else.
import { getRouterParam, setResponseHeaders } from 'h3'
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { calendarOfAssignment } from '../../../../calendar'
import { calendarKey } from '../../../../words'

export default defineRoute({
  public: true,
  rateLimit: 'default',
  input: z.object({ k: z.string().min(1).max(200) }).strict(), // not-policy: shape bound
}, async (event, { input }) => {
  const id = getRouterParam(event, 'id')!
  if (input.k !== await calendarKey(id)) refuse('core.not-found', 'There is nothing here.', { status: 404 })
  const file = await calendarOfAssignment(id)
  if (!file) refuse('core.not-found', 'There is nothing here.', { status: 404 })
  setResponseHeaders(event, { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'attachment; filename="shift.ics"', 'cache-control': 'private, no-store' })
  return file
})
