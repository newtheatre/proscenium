// A person's private calendar feed, /calendar/<token>.ics (C-70, CF2): the token is the only sign-in,
// so the answer is private and never kept, and an unknown or reset token is simply not found.
import { getRouterParam, setResponseHeaders } from 'h3'
import { defineRoute, refuse } from '#kit'
import { feedFile } from '../../feed'

export default defineRoute({ public: true, module: 'calendar-feed', tokens: ['file'], rateLimit: 'default' }, async (event, { unit }) => {
  const token = getRouterParam(event, 'file')!.replace(/\.ics$/, '')
  const file = await feedFile(unit, token)
  if (file === null) refuse('core.not-found', 'There is nothing here.', { status: 404 })
  setResponseHeaders(event, { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, no-store' })
  return file
})
