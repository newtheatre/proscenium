import { changes } from '#shared/utils/audit'
import { saysSeasonMoved, showUpdateForm } from '#shared/utils/programme'

// Edit a show's copy, its address and the booking window its performances inherit. It does not
// take the status: publishing is its own action (D-121 criterion 1, D-112 criterion 1).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await showById(id)
  if (!held) throw noSuch('show')

  const input = await readValidatedBodyOrThrow(event, showUpdateForm)
  const window = input.bookingClosesHoursBefore ?? null

  // Both predicates ride the UPDATE: the address is held once, and a season chosen over one set
  // since the form loaded refuses rather than undo it (0003, 0006, D-131 criterion 2).
  const [updated] = await db.all<{ id: string, seasonId: string | null }>(updateShowStatement(id, input))

  if (!updated) {
    const now = await showById(id)
    if (!now) throw noSuch('show')
    const chosen = input.seasonId ?? null
    if (chosen !== input.loadedSeasonId && now.seasonId !== input.loadedSeasonId) {
      throw createError({ statusCode: 409, statusMessage: saysSeasonMoved(now.title, now.seasonName) })
    }
    throw createError({ statusCode: 409, statusMessage: `A show already has the address /shows/${input.slug}` })
  }

  // The copy is prose, so the trail records that it moved and never what it says (0011).
  const copyChanged = input.description !== held.description
    || input.longDescription !== held.longDescription
    || input.subtitle !== held.subtitle

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'show.updated',
    target: `show:${id}`,
    detail: {
      ...changes({
        slug: [held.slug, input.slug],
        title: [held.title, input.title],
        ageGuidance: [held.ageGuidance, input.ageGuidance ?? null],
        latecomerPolicy: [held.latecomerPolicy, input.latecomerPolicy ?? null],
        bookingClosesHoursBefore: [held.bookingClosesHoursBefore, window],
        categoryId: [held.categoryId, input.categoryId ?? null],
        seasonId: [held.seasonId, updated.seasonId],
      }),
      copyChanged,
    },
  }))

  return { ok: true }
})
