// The first calendar feed addresses were made here (SU-8). They still answer, now with the person's
// whole feed from the calendar-feed module, so nobody has to subscribe again (C-70, CF5).
import { getRouterParam, setResponseHeaders } from 'h3'
import { defineRoute, refuse } from '#kit'
import { feedFile } from '#modules/calendar-feed'

export default defineRoute({ public: true, tokens: ['token'], rateLimit: 'default' }, async (event, { unit }) => {
  const file = await feedFile(unit, getRouterParam(event, 'token')!)
  if (file === null) refuse('core.not-found', 'There is nothing here.', { status: 404 })
  setResponseHeaders(event, { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, no-store' })
  return file
})
