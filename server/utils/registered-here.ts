import type { H3Event } from 'h3'

// The browser that registered an address holds it sealed, so the confirmation link opened there
// signs in and opened anywhere else only confirms (0103). Nothing in the cookie is readable.
const REGISTERED_HERE = 'nnt-registered'

function registration(event: H3Event) {
  return useSession<{ email?: string }>(event, {
    name: REGISTERED_HERE,
    password: useRuntimeConfig(event).session.password,
    maxAge: VERIFY_TOKEN_HOURS * 60 * 60,
    cookie: { sameSite: 'lax', path: '/' },
    // The cookie alone: h3 would otherwise also read a sealed value from a request header.
    sessionHeader: false,
  })
}

// Set for every address typed, so whether an account was made cannot be read from the answer.
export async function rememberRegistration(event: H3Event, email: string): Promise<void> {
  await (await registration(event)).update({ email: normaliseEmail(email) })
}

// Spent by the first confirmation that asks, so no later link finds it.
export async function takeRegistration(event: H3Event): Promise<string | null> {
  if (!getCookie(event, REGISTERED_HERE)) return null
  const session = await registration(event)
  const email = session.data.email ?? null
  await session.clear()
  return email
}
