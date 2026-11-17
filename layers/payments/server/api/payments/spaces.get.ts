// The spaces a till session may be at, as a person reads each ("Studio, Portland Building"), for the
// till's place menu (payments.session.open) and the default-space setting (payments.settings.manage).
import { can, defineRoute, Refusal } from '#kit'
import { listSpaces, placeName } from '#modules/core'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
}, async (_event, { actor }) => {
  if (!(await can(actor, 'payments.session.open')).allowed && !(await can(actor, 'payments.settings.manage')).allowed)
    throw new Refusal('core.access.denied', 'You cannot open till sessions or change payments settings.', { status: 403 })
  const spaces = await listSpaces()
  return { spaces: await Promise.all(spaces.map(async s => ({ id: s.id, place: await placeName(s.id) ?? s.name }))) }
})
