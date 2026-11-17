// The outside providers a person may sign in with (ID-04). Each is an OpenID Connect provider,
// described here once: where to send the browser, where to swap the code, which issuers to accept,
// which settings switch it on and name its client, and which credential holds its secret. The flow
// itself (`oidc.ts`) knows nothing about any one provider. Google is the only one so far; another is
// a new entry here, its settings and its credential, and nothing else.
import { refuse, useSetting } from '#kit'
import type { SettingKey } from '#kit/registry-types'

export interface SignInProvider {
  /** Kept in core_federated_identities.provider and named in the session's methods. Also the path segment. */
  id: string
  /** Shown on the sign-in button: "Sign in with {label}". */
  label: string
  authoriseUrl: string
  tokenUrl: string
  /** Issuers an ID token from this provider may carry. */
  issuers: string[]
  scope: string
  /** The settings that switch it on, name its client and list the organisations it accepts. */
  settings: { on: SettingKey, clientId: SettingKey, domains: SettingKey }
  /** The credential holding its client secret. */
  secret: string
  /**
   * The ID token claim naming the person's organisation (Google's `hd`), checked against the accepted
   * domains, and the authorisation parameter asking the provider to keep to one organisation.
   */
  organisation: { claim: string, hint?: string }
  /** Extra authorisation parameters, such as asking the person to choose an account. */
  extra?: Record<string, string>
  /** Whether addresses in core.sign-in.managed-domains sign in only through this provider. */
  managedDomains: boolean
}

export const PROVIDERS = {
  google: {
    id: 'google',
    label: 'Google',
    authoriseUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
    scope: 'openid email profile',
    settings: { on: 'core.sign-in.google', clientId: 'core.sign-in.google-client-id', domains: 'core.sign-in.google-domains' },
    secret: 'CORE_GOOGLE_CLIENT_SECRET',
    organisation: { claim: 'hd', hint: 'hd' },
    extra: { prompt: 'select_account' },
    managedDomains: true,
  },
} as const satisfies Record<string, SignInProvider>

export type ProviderId = keyof typeof PROVIDERS

/** The provider an address names, or a refusal that looks like any other missing page. */
export function providerById(id: string): SignInProvider {
  const provider = (PROVIDERS as Record<string, SignInProvider>)[id]
  if (!provider) refuse('core.not-found', 'There is nothing here.', { status: 404 })
  return provider
}

/** Whether a provider is switched on and has its client named. Its secret is checked when it is used. */
export async function isOffered(provider: SignInProvider): Promise<boolean> {
  return !!(await useSetting(provider.settings.on)) && !!(await useSetting(provider.settings.clientId))
}

/** The providers a signed-out browser is offered, in the order declared. */
export async function offeredProviders(): Promise<{ id: string, label: string }[]> {
  const offered: { id: string, label: string }[] = []
  for (const provider of Object.values(PROVIDERS) as SignInProvider[]) {
    if (await isOffered(provider)) offered.push({ id: provider.id, label: provider.label })
  }
  return offered
}

/** The provider managed-domain addresses are sent to. */
export function managedDomainProvider(): SignInProvider {
  return (Object.values(PROVIDERS) as SignInProvider[]).find(p => p.managedDomains)!
}
