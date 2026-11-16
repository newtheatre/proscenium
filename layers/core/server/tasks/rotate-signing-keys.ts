// Daily: makes a new signing key for each purpose whose current key is due, and retires keys whose
// keep period has passed, erasing their private parts (F-37).
import { defineTask } from '#kit'
import { rotateSigningKeys } from '#kit/signing'

export default defineTask(async (unit) => {
  await rotateSigningKeys(unit)
})
