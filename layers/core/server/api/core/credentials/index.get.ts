// The keys a page's KeysCard shows (Matt, 17 November: keys are managed in the app): for each named
// credential the viewer may manage, where its value comes from now and the last four characters of a
// saved one. Never a value. A credential saved per record on its own screen (a payment provider
// account's keys) has no `manage` ability and is not offered here.
import { z } from 'zod'
import { can, credentialEntry, credentialStatus, defineRoute, refuse } from '#kit'
import { holds } from '../../../interface/navigation'

const NAME = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/ // not-policy: a credential's name

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({
    names: z.string().max(1000).transform(s => s.split(',').map(n => n.trim()).filter(Boolean)).pipe(z.array(z.string().regex(NAME)).min(1).max(20)), // not-policy: one card's keys
  }),
}, async (_event, { input, actor }) => {
  const out = []
  for (const name of input.names) {
    const entry = credentialEntry(name)
    if (!entry?.decl.manage) continue
    if (!holds(await can(actor, entry.decl.manage as never))) continue
    const [status] = await credentialStatus([name])
    const short = name.slice(entry.module.length + 1).toLowerCase().replaceAll('_', '-')
    out.push({
      name,
      module: entry.module,
      source: status!.source,
      hint: status!.hint,
      start: status!.start,
      setAt: status!.setAt,
      labelKey: `${entry.module}.credentials.${short}.label`,
      helpKey: `${entry.module}.credentials.${short}.help`,
      confirm: entry.decl.confirm === true,
    })
  }
  if (!out.length) return refuse('core.not-found', 'There is nothing here.', { status: 404 })
  return { keys: out }
})
