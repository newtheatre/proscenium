// Saves or removes keys from a KeysCard (Matt, 17 November: keys are managed in the app). Each is a
// credential saved for the whole site, encrypted with CORE_ENCRYPTION_KEY and audited by name, never
// by value. A key not named is left as it is; null removes the saved one. Each needs the ability its declaration names, which
// the registry holds to be privileged, so saving asks for a fresh sign-in. The answer is the keys' new state, never a value.
import { z } from 'zod'
import { clearCredential, credentialEntry, credentialStatus, defineRoute, refuse, requireAbility, setCredential, useContext } from '#kit'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({
    keys: z.record(z.string(), z.string().trim().min(1).max(2000).nullable()), // not-policy: a key or token is well under this
  }).strict(),
}, async (_event, { input, unit, actor }) => {
  const names = Object.keys(input.keys)
  if (!names.length) refuse('core.input.invalid', 'Name at least one key.', { status: 422 })
  const context = useContext()
  for (const name of names) {
    const entry = credentialEntry(name)
    if (!entry?.decl.manage) refuse('core.credential.unknown', `There is no key called ${name} that can be saved here.`, { status: 422 })
    context.allowedBy = await requireAbility(actor, entry!.decl.manage as never)
    context.ability = entry!.decl.manage
  }
  for (const name of names) {
    const value = input.keys[name]
    if (value === null) clearCredential(unit.view(), name)
    else if (value !== undefined) await setCredential(unit.view(), name, value, { by: actor.accountId ?? null })
  }
  await unit.commit()
  return { keys: (await credentialStatus(names)).map(({ name, source, hint, start }) => ({ name, source, hint, start })) }
})
