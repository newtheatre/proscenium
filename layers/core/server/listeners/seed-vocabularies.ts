// A module was switched on: make the vocabularies it declares, with their starting terms (group 3),
// and the fact mappings and roles it brings (FH-4). Read services also make any vocabularies that are
// missing, so a module that is always on needs no switch; core's own roles are made at setup.
import { defineListener } from '#kit'
import { ensureVocabularies } from '../vocabularies/service'
import { ensureModuleDefaults } from '../identity/defaults'

export default defineListener(async (event) => {
  await ensureVocabularies(event.payload.moduleId as string)
  await ensureModuleDefaults(event.payload.moduleId as string)
})
