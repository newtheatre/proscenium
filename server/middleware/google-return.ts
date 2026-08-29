// Google's round trip loses the query string, so where the person was is kept in a cookie for the
// length of it. Set here rather than in the OAuth handler, which only sees the callback.
export default defineEventHandler((event) => {
  if (getRequestURL(event).pathname !== '/auth/google') return

  const next = getQuery(event).next
  if (typeof next !== 'string' || !/^\/(?!\/)/.test(next)) return

  setCookie(event, 'nnt-after-google', next, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
})
