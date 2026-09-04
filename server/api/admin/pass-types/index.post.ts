import { sql } from 'drizzle-orm'
import { newPassTypeForm } from '#shared/utils/pass-types'

// Add a pass product: its window, its price points and the shows it covers, in one batch. Nothing
// is issued here; issuing one is D-124's `passes` table.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'ticketing.write')
  const input = await readValidatedBodyOrThrow(event, newPassTypeForm)
  const { showIds } = input
  const id = newId()

  const known = new Set((await listShowOptions()).map(show => show.id))
  if (showIds.some(showId => !known.has(showId))) {
    throw createError({ statusCode: 400, statusMessage: 'No such show' })
  }

  // The slug predicate rides the INSERT, so two officers naming the same address at once produce
  // one product and a refusal rather than a constraint error (0003, 0006).
  const created = await db.all<{ id: string }>(sql`
    INSERT INTO pass_types (id, slug, name, description, valid_from, valid_until, sales_open_at, sales_close_at, max_issued, status)
    SELECT ${id}, ${input.slug}, ${input.name}, ${input.description ?? null}, ${input.validFrom},
           ${input.validUntil}, ${input.salesOpenAt ?? null}, ${input.salesCloseAt ?? null}, ${input.maxIssued ?? null}, 'DRAFT'
    WHERE NOT EXISTS (SELECT 1 FROM pass_types WHERE slug = ${input.slug})
    RETURNING id
  `)

  if (created.length === 0) {
    throw createError({ statusCode: 409, statusMessage: `A pass already has the address ${input.slug}` })
  }

  await db.batch([
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'pass-type.created',
      target: `pass-type:${id}`,
      detail: { name: input.name, slug: input.slug, prices: input.prices, showCount: showIds.length },
    })),
    ...input.prices.map(price => db.insert(schema.passTypePrices).values({
      id: newId(),
      passTypeId: id,
      label: price.label,
      price: price.price,
    })),
    ...showIds.map(showId => db.insert(schema.passTypeShows).values({ id: newId(), passTypeId: id, showId })),
  ])

  return { ok: true, id }
})
