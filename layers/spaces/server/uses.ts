// Other modules' uses of a space (rule C1a): what they report to core's core.space-busy, leaving out
// Spaces' own contribution. Read just before a write; a use cannot sit on the write's statement.
import { refuse, usePoint, type Actor } from '#kit'
import type { SpaceBusy, SpaceBusyItem } from '#modules/core'

export type Use = SpaceBusyItem & { module: string }

export async function usesOf(spaceIds: string[], from: number, to: number, actor: Actor | null): Promise<Use[]> {
  if (!spaceIds.length) return []
  const out: Use[] = []
  for (const { module, value } of await usePoint<SpaceBusy>('core.space-busy')) {
    if (module === 'spaces') continue
    for (const b of await value.busy({ spaceIds, from, to }, actor))
      if (spaceIds.includes(b.spaceId) && b.from < to && b.to > from) out.push({ ...b, module })
  }
  return out.sort((a, b) => a.from - b.from)
}

/** C1a before a write that takes the time: refused while another module uses the space then. */
export async function assertNoUse(spaceId: string | null, from: number, to: number): Promise<void> {
  if (!spaceId) return
  const [use] = await usesOf([spaceId], from, to, null)
  if (use) refuse('spaces.clash', 'The room is in use for something else at that time.', { status: 409, remedy: 'Choose another time.' })
}
