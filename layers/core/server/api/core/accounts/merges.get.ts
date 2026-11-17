// Merges (identity spec part 6): recent merges with where each stands, and whether it can still be
// undone. Undoing one is accounts/merges/<id>/undo.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { recentMerges } from '../../../identity/merge-undo'

export default defineRoute({ ability: 'core.account.merge', rateLimit: 'default', input: z.object({}) }, async () => {
  return { merges: await recentMerges() }
})
