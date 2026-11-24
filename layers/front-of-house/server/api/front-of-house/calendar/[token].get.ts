// A person's private calendar feed (SU-8): everything they are on, for a calendar app to subscribe
// to. The token in the address is the only sign-in; resetting it from My shifts retires the address.
import { getRouterParam } from 'nuxt/server'
import { defineRoute, refuse } from '#kit'
import { accountOfFeed, calendarOfAccount } from '../../../calendar'

export default defineRoute({ public: true, tokens: ['token'], rateLimit: 'default' }, async (event) => {
  const accountId = await accountOfFeed(getRouterParam(event, 'token', { decode: true })!)
  if (!accountId) refuse('core.not-found', 'There is nothing here.', { status: 404 })
  for (const [name, value] of Object.entries({ 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, no-store' })) event.res.headers.set(name, String(value))
  return calendarOfAccount(accountId)
})
