// A profile's past exports (S8), newest first, each saying whether the code map has changed since.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { getProfile } from '../../../profiles'
import { currentDigest, runsOf } from '../../../build'

export default defineRoute({
  ability: 'invoicing.export.take',
  rateLimit: 'default',
  input: z.object({ profileId: z.string().min(1).max(40) }), // not-policy: an id's length
}, async (_event, { input }) => {
  const profile = await getProfile(input.profileId)
  const digest = await currentDigest(profile)
  return { runs: (await runsOf(profile.id)).map(({ by: _by, ...r }) => ({ ...r, mapChanged: r.mapVersion !== digest })) }
})
