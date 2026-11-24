// The provider sends the browser back here. Signs in and returns to where the person was going
// (ID-07); on any refusal, back to the sign-in page with the reason's code.
import { getRouterParam, setResponseStatus } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute, isRefusal } from '#kit'
import { finishProvider, signInWithProvider } from '../../../../identity/oidc'
import { providerById } from '../../../../identity/providers'

export default defineRoute({
  public: true,
  rateLimit: 'sign-in-network',
  input: z.object({ code: z.string().max(2048).optional(), state: z.string().max(200).optional(), error: z.string().max(200).optional() }), // not-policy: lengths providers' values fit in
}, async (event, { input, unit }) => {
  const provider = providerById(getRouterParam(event, 'provider', { decode: true }) ?? '')
  let to: string
  try {
    if (!input.code || !input.state) throw Object.assign(new Error('cancelled'), { name: 'Refusal', code: 'core.sign-in.provider-cancelled' })
    const { claims, next } = await finishProvider(event, provider, { code: input.code, state: input.state })
    await signInWithProvider(unit, event, provider, claims)
    to = next ?? '/'
  }
  catch (error) {
    if (!isRefusal(error)) throw error
    to = `/sign-in?error=${encodeURIComponent((error as { code: string }).code)}`
  }
  setResponseStatus(event, 302) // not-policy: HTTP Found
  event.res.headers.set('location', to)
  return ''
})
