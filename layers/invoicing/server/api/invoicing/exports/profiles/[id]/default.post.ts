// Makes a profile the one Exports opens on (the setting invoicing.exports.default-profile).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { changeSetting, defineRoute } from '#kit'
import { getProfile } from '../../../../../profiles'

export default defineRoute({ ability: 'invoicing.settings.manage', rateLimit: 'write', input: z.object({}).strict() }, async (event, { unit }) => {
  const profile = await getProfile(getRouterParam(event, 'id')!)
  await changeSetting(unit, 'invoicing.exports.default-profile', profile.id)
  return { ok: true }
})
