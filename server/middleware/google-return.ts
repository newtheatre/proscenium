import { googleRoundTripStart } from '#shared/utils/google-sign-in'

const RETURN_COOKIE = 'nnt-after-google'
const REAUTH_COOKIE = 'nnt-reauth'
const KEPT = { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 } as const

// Google's round trip loses the query string, so where the person was and why is kept in cookies
// for the length of it. Set here rather than in the OAuth handler, which only sees the callback.
export default defineEventHandler((event) => {
  if (getRequestURL(event).pathname !== '/auth/google') return

  const start = googleRoundTripStart(getQuery(event))
  if (!start) return

  // Whatever an abandoned attempt left goes, so it cannot steer this sign-in somewhere it did not
  // ask to go, or turn it into a reassertion (A-128 criterion 4, 0094).
  if (start.next) setCookie(event, RETURN_COOKIE, start.next, KEPT)
  else deleteCookie(event, RETURN_COOKIE, { path: '/' })

  // A reassertion, not a sign-in: the callback must find the same account already in session.
  if (start.reauth) setCookie(event, REAUTH_COOKIE, '1', KEPT)
  else deleteCookie(event, REAUTH_COOKIE, { path: '/' })
})
