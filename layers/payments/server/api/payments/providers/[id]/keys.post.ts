// Saves or removes a provider account's keys (Matt, 17 November: keys are managed in the app). Each
// is a Payments credential saved for this account, encrypted; a value is never sent back. A key not
// named is left as it is; null removes the saved one, and a Worker secret of the same name, if any,
// is used again. Managing providers is privileged, so this asks for a fresh sign-in.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { clearCredential, credentialStatus, defineRoute, refuse, setCredential } from '#kit'
import { providerAccount, providers } from '../../../../providers'

export default defineRoute({
  ability: 'payments.provider.manage',
  record: event => ['payments.provider-account', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({
    keys: z.record(z.string(), z.string().trim().min(1).max(500).nullable()), // not-policy: a provider's key is well under this
  }).strict(),
}, async (_event, { input, record, unit, actor }) => {
  const account = await providerAccount(record!.id!)
  const provider = account && (await providers()).get(account.provider)
  if (!account || !provider) refuse('core.not-found', 'There is no such provider account.', { status: 404 })
  const names = Object.keys(input.keys)
  const unknown = names.filter(n => !provider!.secrets.includes(n))
  if (unknown.length) refuse('payments.provider.unknown-key', `${account!.provider} has no key called ${unknown.join(', ')}.`, { status: 422 })
  for (const name of names) {
    const value = input.keys[name]
    if (value === null) clearCredential(unit.view(), name, { scope: account!.id, record: ['payments.provider-account', account!.id] })
    else if (value !== undefined) await setCredential(unit.view(), name, value, { scope: account!.id, by: actor.accountId ?? null, record: ['payments.provider-account', account!.id] })
  }
  await unit.commit()
  return { keys: (await credentialStatus(provider!.secrets, account!.id)).map(({ name, source, hint }) => ({ name, source, hint })) }
})
