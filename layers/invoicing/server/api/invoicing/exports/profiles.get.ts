// The export profiles, for Exports (S8) and Export profiles (S10): each with the range its period rule opens on.
import { can, defineRoute, useSetting } from '#kit'
import { columnsOf, listProfiles } from '../../../profiles'
import { openingRange } from '../../../build'

export default defineRoute({ ability: 'invoicing.export.take', rateLimit: 'default' }, async (_event, { actor }) => {
  const profiles = await listProfiles()
  const defaultId = await useSetting('invoicing.exports.default-profile') as string | null
  return {
    canManage: (await can(actor, 'invoicing.export.manage')).allowed,
    canSetDefault: (await can(actor, 'invoicing.settings.manage')).allowed,
    defaultProfileId: profiles.some(p => p.id === defaultId && p.archivedAt === null) ? defaultId : (profiles.find(p => p.archivedAt === null)?.id ?? null),
    profiles: await Promise.all(profiles.map(async p => ({
      id: p.id,
      name: p.name,
      format: p.format,
      granularity: p.granularity,
      columns: columnsOf(p).length,
      archived: p.archivedAt !== null,
      updatedAt: p.updatedAt,
      opening: await openingRange(p),
    }))),
  }
})
