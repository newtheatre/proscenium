import { changes } from '#shared/utils/audit'
import { saysNoSuch } from '#shared/utils/no-such'
import { saysSeasonMoved, showUpdateForm } from '#shared/utils/programme'

// Edit a show's copy, its address and the booking window its performances inherit. It does not
// take the status: publishing is its own action (D-121 criterion 1, D-112 criterion 1).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await showById(id)
  if (!held) throw noSuch('show')

  const input = await readValidatedBodyOrThrow(event, showUpdateForm)
  const chosen = input.seasonId ?? null
  const chose = chosen !== input.loadedSeasonId

  // The copy is prose, so the trail records that it moved and never what it says (0011).
  const copyChanged = input.description !== held.description
    || input.longDescription !== held.longDescription
    || input.subtitle !== held.subtitle

  // The season pair is recorded only where the form chose one, which the predicate makes exact.
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'show.updated',
    target: `show:${id}`,
    detail: {
      ...changes({
        slug: [held.slug, input.slug],
        title: [held.title, input.title],
        ageGuidance: [held.ageGuidance, input.ageGuidance ?? null],
        latecomerPolicy: [held.latecomerPolicy, input.latecomerPolicy ?? null],
        bookingClosesHoursBefore: [held.bookingClosesHoursBefore, input.bookingClosesHoursBefore ?? null],
        categoryId: [held.categoryId, input.categoryId ?? null],
        ...(chose ? { seasonId: [input.loadedSeasonId, chosen] as [unknown, unknown] } : {}),
      }),
      copyChanged,
    },
  })

  // Every refusal rides the UPDATE, and the audit rides its batch on changes() (0003, 0049).
  const applied = await auditedWrite(db.all<{ id: string }>(updateShowStatement(id, input)), entry)
  if (applied) return { ok: true }

  const now = await showById(id)
  if (!now) throw noSuch('show')
  if (chose && now.seasonId !== input.loadedSeasonId) {
    throw createError({ statusCode: 409, statusMessage: saysSeasonMoved(now.title, now.seasonName) })
  }
  if (chose && chosen !== null) chosenOrThrow('season', await seasonById(chosen))
  const category = input.categoryId ?? null
  if (category !== null && category !== now.categoryId) chosenOrThrow('show category', await showCategoryById(category))
  throw createError({ statusCode: 409, statusMessage: `A show already has the address /shows/${input.slug}` })
})

// Why a season or a category could not be chosen: read only to explain the refused write.
function chosenOrThrow(noun: string, found: { name: string, archived: boolean } | undefined): void {
  if (!found) throw createError({ statusCode: 400, statusMessage: saysNoSuch(noun) })
  if (found.archived) throw createError({ statusCode: 409, statusMessage: `${found.name} is retired and cannot be chosen for a show` })
}
