// Invoicing was switched on: make its first export profile, every account unmapped, so the treasurer's
// first job shows as a count on Exports. The students' union preset makes the union's. Safe to repeat.
import { defineListener, first, useSetting } from '#kit'
import type { Starter } from '../../shared/exports'
import { createProfile } from '../profiles'

export default defineListener(async (event, unit) => {
  if (event.payload.moduleId !== 'invoicing') return
  if (await first('SELECT 1 FROM invoicing_export_profiles')) return
  await createProfile(unit, { starter: await useSetting('invoicing.exports.starter') as Starter })
})
