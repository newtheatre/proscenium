// Google's round trip loses the query string, so where the person was and why is kept in cookies
// for the length of it. Set here rather than in the OAuth handler, which only sees the callback.
export default defineEventHandler((event) => {
  if (getRequestURL(event).pathname !== '/auth/google') return

  const next = getQuery(event).next
  if (typeof next === 'string' && /^\/(?!\/)/.test(next)) {
    setCookie(event, 'nnt-after-google', next, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    })
  }

  // A reassertion, not a sign-in: the callback must find the same account already in session
  // (A-128 criterion 4).
  if (getQuery(event).reauth === '1') {
    setCookie(event, 'nnt-reauth', '1', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    })
  }
})
