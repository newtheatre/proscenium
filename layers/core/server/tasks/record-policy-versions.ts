// Hourly: writes a version of each policy whose text reads differently from every version kept, so
// a change of wording or of a quoted setting is on record soon after it happens.
import { defineTask } from '#kit'
import { recordVersions } from '../policies/versions'

export default defineTask(async () => {
  await recordVersions()
})
