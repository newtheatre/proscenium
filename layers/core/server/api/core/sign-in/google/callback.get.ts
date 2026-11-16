// Google sends the browser back here. Signs in and returns to where the person was going (ID-07);
// on any refusal, back to the sign-in page with the reason's code.
import { setResponseHeader, setResponseStatus } from 'h3'
import { z } from 'zod'
import { defineRoute, isRefusal } from '#kit'
import { finishGoogle, signInWithGoogle } from '../../../../identity/google'

export default defineRoute({
  public: true,
  rateLimit: 'sign-in',
  input: z.object({ code: z.string().max(2048).optional(), state: z.string().max(200).optional(), error: z.string().max(200).optional() }), // not-policy: lengths Google's values fit in
}, async (event, { input, unit }) => {
  let to: string
  try {
    if (!input.code || !input.state) throw Object.assign(new Error('cancelled'), { name: 'Refusal', code: 'core.sign-in.provider-cancelled' })
    const { claims, next } = await finishGoogle(event, { code: input.code, state: input.state })
    await signInWithGoogle(unit, event, claims)
    to = next ?? '/'
  }
  catch (error) {
    if (!isRefusal(error)) throw error
    to = `/sign-in?error=${encodeURIComponent((error as { code: string }).code)}`
  }
  setResponseStatus(event, 302) // not-policy: HTTP Found
  setResponseHeader(event, 'location', to)
  return ''
})
