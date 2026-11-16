// A module was switched on: make the vocabularies it declares, with their starting terms (group 3).
// Read services also make any that are missing, so a module that is always on needs no switch.
import { defineListener } from '#kit'
import { ensureVocabularies } from '../vocabularies/service'

export default defineListener(async (event) => {
  await ensureVocabularies(event.payload.moduleId as string)
})
