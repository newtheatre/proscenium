// Checks a provider's saved client id and secret with the provider itself, before anyone relies on
// them: the provider either accepts the pair or says it does not know it. Nothing is saved.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { credential, defineRoute, refuse, useSetting } from '#kit'
import { checkProvider, providerById } from '../../../../identity/providers'

export default defineRoute({
  ability: 'core.identity-settings.manage',
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (event) => {
  const provider = providerById(getRouterParam(event, 'provider', { decode: true }) ?? '')
  const clientId = await useSetting(provider.settings.clientId) as string | null
  const secret = await credential(provider.secret)
  if (!clientId || !secret) refuse('core.sign-in.provider-incomplete', `Save ${provider.label}'s client ID and client secret first.`, { status: 409 })
  const answer = await checkProvider(provider, clientId!, secret!)
  if (answer === 'rejected') refuse('core.sign-in.provider-rejected', `${provider.label} did not accept this client ID and secret.`, { status: 422, remedy: 'Copy both again from the same OAuth client, and save them.' })
  if (answer === 'unreachable') refuse('core.sign-in.provider-unreachable', `${provider.label} did not give a clear answer.`, { status: 502, remedy: 'Try again in a minute.' })
  return { accepted: true }
})
