import { sql } from 'drizzle-orm'
import { contentWarningForm } from '#shared/utils/content-warnings'

// Add a warning to the vocabulary. Shows choose from this list and never type their own, which is
// what makes two shows warn about the same thing in the same words (D-102 criterion 1).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'ticketing.write')
  const input = await readValidatedBodyOrThrow(event, contentWarningForm)
  const id = newId()

  // The predicate rides the INSERT, so two officers adding the same warning at once produce one
  // entry and a refusal rather than a constraint error (0003, 0006).
  const created = await db.all<{ id: string }>(sql`
    INSERT INTO content_warnings (id, slug, title, kind, category, description, icon, sort, archived)
    SELECT ${id}, ${input.slug}, ${input.title}, ${input.kind}, ${input.category ?? null},
           ${input.description ?? null}, ${input.icon ?? null}, ${input.sort}, ${input.archived ? 1 : 0}
    WHERE NOT EXISTS (
      SELECT 1 FROM content_warnings WHERE slug = ${input.slug} OR title = ${input.title} COLLATE NOCASE
    )
    RETURNING id
  `)

  if (created.length === 0) {
    const taken = await contentWarningNamed(input.slug, input.title)
    throw createError({ statusCode: 409, statusMessage: `The vocabulary already holds ${taken?.title ?? input.title}` })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'content-warning.created',
    target: `content-warning:${id}`,
    detail: { slug: input.slug, title: input.title, kind: input.kind },
  }))

  return { ok: true, id }
})
