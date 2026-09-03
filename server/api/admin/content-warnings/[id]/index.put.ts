import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { contentWarningForm } from '#shared/utils/content-warnings'

// Edit a vocabulary entry, archiving included. The kind is what a show's level was graded against,
// so changing it would regrade every show that carries it and this refuses instead.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await contentWarningById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such content warning' })

  const input = await readValidatedBodyOrThrow(event, contentWarningForm)
  if (input.kind !== held.kind && held.showCount > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `${held.title} is carried by ${plural(held.showCount, 'show')}, so its kind cannot change: `
        + 'a general warning is graded and a staging one is not',
    })
  }

  // The uniqueness predicate rides the UPDATE, so a rename onto a title somebody is taking at the
  // same moment refuses rather than reaching the unique index (0003, 0006).
  const updated = await db.all<{ id: string }>(sql`
    UPDATE content_warnings
    SET slug = ${input.slug},
        title = ${input.title},
        kind = ${input.kind},
        category = ${input.category ?? null},
        description = ${input.description ?? null},
        icon = ${input.icon ?? null},
        sort = ${input.sort},
        archived = ${input.archived ? 1 : 0}
    WHERE id = ${id}
      AND NOT EXISTS (
        SELECT 1 FROM content_warnings
        WHERE (slug = ${input.slug} OR title = ${input.title} COLLATE NOCASE) AND id <> ${id}
      )
    RETURNING id
  `)

  if (updated.length === 0) {
    const taken = await contentWarningNamed(input.slug, input.title, id)
    if (!taken) throw createError({ statusCode: 404, statusMessage: 'No such content warning' })
    throw createError({ statusCode: 409, statusMessage: `The vocabulary already holds ${taken.title}` })
  }

  // The description is prose, so the trail records that it moved and never what it says (0011).
  const descriptionChanged = (input.description ?? null) !== held.description

  // A save that changed nothing is not an event. The append-only trail is evidence, and a year of
  // empty entries is what makes somebody stop reading it.
  const changed = input.slug !== held.slug
    || input.title !== held.title
    || input.kind !== held.kind
    || input.archived !== held.archived
    || input.sort !== held.sort
    || (input.category ?? null) !== held.category
    || (input.icon ?? null) !== held.icon
    || descriptionChanged

  if (changed) {
    await db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'content-warning.updated',
      target: `content-warning:${id}`,
      detail: {
        ...changes({
          slug: [held.slug, input.slug],
          title: [held.title, input.title],
          kind: [held.kind, input.kind],
          archived: [held.archived, input.archived],
        }),
        descriptionChanged,
      },
    }))
  }

  return { ok: true }
})
