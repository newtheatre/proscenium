// Saves a provider's set-up in one change: its client id, the organisations it accepts and, when
// typed, its client secret. Switching it on is a separate step, the setting itself, so it comes last
// and the rules that need the id and secret are met by then.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { changeSettings, clearCredential, credentialEntry, defineRoute, refuse, requireAbility, setCredential, useContext, useSetting } from '#kit'
import { mayChangeSetting } from '../../../settings/save'
import { providerById, providerView } from '../../../identity/providers'

export default defineRoute({
  ability: 'core.identity-settings.manage',
  rateLimit: 'write',
  input: z.object({
    clientId: z.string().trim().max(200).nullable(), // not-policy: the setting's own limit
    domains: z.array(z.string().trim().toLowerCase().min(1).max(253)).max(50), // not-policy: a domain's length; a sane count
    /** A new secret; left out keeps the saved one, null removes it while the provider is out of use. */
    secret: z.string().trim().min(1).max(2000).nullable().optional(), // not-policy: a secret is well under this
    /** The person has seen the change to accepted organisations, which can shut people out, and confirmed it. */
    confirm: z.boolean().optional(),
  }).strict(),
}, async (event, { input, actor, unit }) => {
  const provider = providerById(getRouterParam(event, 'provider') ?? '')
  const wanted: [string, unknown][] = [[provider.settings.clientId, input.clientId || null], [provider.settings.domains, [...new Set(input.domains)]]]
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
      if (await useSetting(provider.settings.on)) refuse('core.sign-in.provider-in-use', `${provider.label} sign-in is in use, so its secret cannot be removed.`, { status: 409, remedy: 'Take it out of use first.' })
      clearCredential(unit.view(), provider.secret)
    }
    else await setCredential(unit.view(), provider.secret, input.secret, { by: actor.accountId ?? null })
  }
  await unit.commit()
  return { provider: await providerView(provider) }
})
