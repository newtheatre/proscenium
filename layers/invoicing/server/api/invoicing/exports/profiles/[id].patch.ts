// Changes an export profile's layout, or archives or restores it.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { profileFields } from '../../../../../shared/exports'
import { updateProfile } from '../../../../profiles'

export default defineRoute({
  ability: 'invoicing.export.manage',
  rateLimit: 'write',
  record: event => ['invoicing.export-profile', getRouterParam(event, 'id')],
  input: z.object({ ...profileFields, archived: z.boolean() }).partial().strict(),
}, async (event, { input, unit }) => {
  await updateProfile(unit, getRouterParam(event, 'id')!, input)
  return { ok: true }
})
