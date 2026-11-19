// The outside sign-in providers, as Admin > Sign-in draws them: one card each, with its client id,
// accepted organisations, whether its secret is saved (never the secret) and the redirect URI to
// register with the provider.
import { defineRoute } from '#kit'
import { PROVIDERS, providerView, type SignInProvider } from '../../../identity/providers'

export default defineRoute({
  ability: 'core.identity-settings.manage',
  rateLimit: 'default',
}, async () => {
  const providers = []
  for (const provider of Object.values(PROVIDERS) as SignInProvider[]) providers.push(await providerView(provider))
  return { providers }
})
