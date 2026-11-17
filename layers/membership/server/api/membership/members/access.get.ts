// What the members list may offer this person: the export, for holders of membership.membership.export.
import { can, defineRoute } from '#kit'

export default defineRoute({ ability: 'membership.membership.view', rateLimit: 'default' }, async (_event, { actor }) => ({
  canExport: (await can(actor, 'membership.membership.export')).allowed,
}))
