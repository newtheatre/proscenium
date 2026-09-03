import { sql } from 'drizzle-orm'
import { showForm } from '#shared/utils/programme'

// Add a show. It is born DRAFT: publishing is its own action, so nothing reaches the public by
// accident (D-121 criteria 1 and 3).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'ticketing.write')
  const input = await readValidatedBodyOrThrow(event, showForm)
  const id = newId()

  // The predicate rides the INSERT, so two officers claiming one address at the same moment
  // produce one show and a refusal rather than a constraint error (0003, 0006).
  const created = await db.all<{ id: string }>(sql`
    INSERT INTO shows (
      id, slug, title, subtitle, description, long_description, age_guidance, latecomer_policy,
      category_id, season_id, booking_closes_hours_before, status
    )
    SELECT ${id}, ${input.slug}, ${input.title}, ${input.subtitle ?? null}, ${input.description ?? null},
           ${input.longDescription ?? null}, ${input.ageGuidance ?? null}, ${input.latecomerPolicy ?? null},
           ${input.categoryId ?? null}, ${input.seasonId ?? null}, ${input.bookingClosesHoursBefore ?? null}, 'DRAFT'
    WHERE NOT EXISTS (SELECT 1 FROM shows WHERE slug = ${input.slug})
    RETURNING id
  `)

  if (created.length === 0) {
    throw createError({ statusCode: 409, statusMessage: `A show already has the address /shows/${input.slug}` })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'show.created',
    target: `show:${id}`,
    detail: { slug: input.slug, bookingClosesHoursBefore: input.bookingClosesHoursBefore ?? null },
  }))

  return { ok: true, id }
})
