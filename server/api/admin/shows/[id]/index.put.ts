import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { showForm } from '#shared/utils/programme'

// Edit a show's copy, its address and the booking window its performances inherit. It does not
// take the status: publishing is its own action (D-121 criterion 1, D-112 criterion 1).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await showById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such show' })

  const input = await readValidatedBodyOrThrow(event, showForm)
  const window = input.bookingClosesHoursBefore ?? null

  // The address predicate rides the UPDATE, so moving onto an address somebody is taking at the
  // same moment refuses rather than reaching the unique index (0003, 0006).
  const updated = await db.all<{ id: string }>(sql`
    UPDATE shows
    SET slug = ${input.slug},
        title = ${input.title},
        subtitle = ${input.subtitle ?? null},
        description = ${input.description ?? null},
        long_description = ${input.longDescription ?? null},
        age_guidance = ${input.ageGuidance ?? null},
        latecomer_policy = ${input.latecomerPolicy ?? null},
        category_id = ${input.categoryId ?? null},
        season_id = ${input.seasonId ?? null},
        booking_closes_hours_before = ${window},
        updated_at = unixepoch()
    WHERE id = ${id}
      AND NOT EXISTS (SELECT 1 FROM shows WHERE slug = ${input.slug} AND id <> ${id})
    RETURNING id
  `)

  if (updated.length === 0) {
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
      }),
      copyChanged,
    },
  }))

  return { ok: true }
})
