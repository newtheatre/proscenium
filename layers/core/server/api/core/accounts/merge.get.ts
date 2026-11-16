// What a merge would do: both accounts side by side, and how many rows would move (ID-32).
import { getQuery } from 'h3'
import { z } from 'zod'
import { defineRoute, requireAbility } from '#kit'
import { mergePreview } from '../../../identity/merge'

export default defineRoute({
  ability: 'core.account.merge',
  record: event => ['core.account', String(getQuery(event).survivorId ?? '') || undefined],
  rateLimit: 'default',
  input: z.object({ survivorId: z.string().max(40), mergedAccountId: z.string().max(40) }), // not-policy: ids are short
}, async (_event, { input, actor }) => {
  await requireAbility(actor, 'core.account.merge', ['core.account', input.mergedAccountId])
  const preview = await mergePreview(input.survivorId, input.mergedAccountId)
  const side = (a: typeof preview.survivor) => a && { id: a.id, name: a.name, preferredName: a.preferred_name, createdAt: a.created_at, claimed: !!a.first_signed_in_at, disabled: !!a.disabled_at }
  return { survivor: side(preview.survivor), mergedAccount: side(preview.mergedAccount), moves: preview.moves }
})
