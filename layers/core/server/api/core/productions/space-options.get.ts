// What "New production" offers as the usual space, and which one it suggests for each open season.
import { z } from 'zod'
import { all, defineRoute } from '#kit'
import { likelyUsualSpace, usualSpaceOptions } from '../../../programme/usual-space'

export default defineRoute({
  ability: 'core.production.create',
  rateLimit: 'default',
  input: z.object({}),
}, async () => {
  const spaces = await usualSpaceOptions()
  const seasons = await all<{ id: string }>("SELECT id FROM core_seasons WHERE state != 'archived'")
  const suggested: Record<string, string | null> = {}
  for (const s of seasons) suggested[s.id] = await likelyUsualSpace(s.id, spaces)
  return { spaces: spaces.map(({ id, label }) => ({ id, label })), suggested, withoutSeason: await likelyUsualSpace(null, spaces) }
})
