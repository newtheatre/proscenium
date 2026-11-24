// Saves a provider's set-up in one change: its client id, the organisations or domains it accepts,
// what is particular to it (Microsoft's tenants, a general provider's discovery address) and, when
// typed, its client secret; a discovery address is checked by fetching it first (MS5). Switching it
// on is a separate step, the setting itself, so the rules needing the id and secret are met by then.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { changeSettings, clearCredential, credentialEntry, defineRoute, refuse, requireAbility, setCredential, useContext, useSetting } from '#kit'
import { mayChangeSetting } from '../../../settings/save'
import { DiscoveryRefusal, discover, labelOf, providerById, providerView } from '../../../identity/providers'

export default defineRoute({
  ability: 'core.identity-settings.manage',
  rateLimit: 'write',
  input: z.object({
    clientId: z.string().trim().max(200).nullable(), // not-policy: the setting's own limit
    domains: z.array(z.string().trim().toLowerCase().min(1).max(253)).max(50), // not-policy: a domain's length; a sane count
    managedDomains: z.array(z.string().trim().toLowerCase().min(1).max(253)).max(50).optional(), // not-policy: as domains
    tenants: z.array(z.string().trim().toLowerCase().length(36)).max(50).optional(), // not-policy: a GUID's length; a sane count
    personal: z.boolean().optional(),
    label: z.string().trim().max(40).nullable().optional(), // not-policy: the setting's own limit
    discovery: z.string().trim().max(300).nullable().optional(), // not-policy: the setting's own limit
    /** A new secret; left out keeps the saved one, null removes it while the provider is out of use. */
    secret: z.string().trim().min(1).max(2000).nullable().optional(), // not-policy: a secret is well under this
    /** The person has seen the change to accepted organisations, which can shut people out, and confirmed it. */
    confirm: z.boolean().optional(),
  }).strict(),
}, async (event, { input, actor, unit }) => {
  const provider = providerById(getRouterParam(event, 'provider') ?? '')
  const extras = { managedDomains: 'managed', tenants: 'tenants', personal: 'personal', label: 'label', discovery: 'discovery' } as const
  const wanted: [string, unknown][] = [[provider.settings.clientId, input.clientId || null], [provider.settings.domains, [...new Set(input.domains)]]]
  for (const [field, setting] of Object.entries(extras) as [keyof typeof extras, keyof typeof provider.settings][]) {
    if (input[field] === undefined) continue
    // Google's managed domains are kept on the sign-in settings, beside whether they are strong.
    const key = provider.settings[setting]
    if (!key || (field === 'managedDomains' && provider.organisation)) refuse('core.sign-in.provider-field', `${provider.id} has no ${field} to set here.`, { status: 400 })
    wanted.push([key, Array.isArray(input[field]) ? [...new Set(input[field] as string[])] : (input[field] || (typeof input[field] === 'boolean' ? input[field] : null))])
  }
  if (input.discovery) {
    try {
      await discover(input.discovery)
    }
    catch (error) {
      const problem = error instanceof DiscoveryRefusal ? error.problem : 'unreachable'
      const reasons = {
        'not-https': ['The issuer and its addresses must use HTTPS.', 'Use the https:// discovery address your provider publishes.'],
        'scopes': ['This provider does not offer the openid and email scopes.', 'Ask the provider to offer email addresses to this site.'],
        'incomplete': ['This is not an OpenID Connect discovery document.', 'It usually ends /.well-known/openid-configuration.'],
        'issuer-mismatch': ['The issuer named in the document is not the address it came from.', 'Use the discovery address under the issuer itself.'],
        'unreachable': ['Nothing answered at this discovery address.', 'Check the address, then try again.'],
      } as const
      const [reason, remedy] = reasons[problem]
      refuse(`core.sign-in.oidc-discovery-${problem}`, reason, { status: 422, remedy, fields: { discovery: `core.sign-in-providers.discovery-problem.${problem}` } })
    }
  }
  const changes = []
  for (const [key, value] of wanted) {
    if (JSON.stringify(await useSetting(key as never)) === JSON.stringify(value)) continue
    await mayChangeSetting(actor, key)
    changes.push({ key, value })
  }
  if (changes.length) await changeSettings(unit, changes, { confirm: input.confirm })
  if (input.secret !== undefined) {
    const context = useContext()
    context.allowedBy = await requireAbility(actor, credentialEntry(provider.secret)!.decl.manage as never)
    if (input.secret === null) {
      if (await useSetting(provider.settings.on)) refuse('core.sign-in.provider-in-use', `${await labelOf(provider)} sign-in is in use, so its secret cannot be removed.`, { status: 409, remedy: 'Take it out of use first.' })
      clearCredential(unit.view(), provider.secret)
    }
    else await setCredential(unit.view(), provider.secret, input.secret, { by: actor.accountId ?? null })
  }
  await unit.commit()
  return { provider: await providerView(provider) }
})
