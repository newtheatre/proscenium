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
    throw createError({ statusCode: 400, statusMessage: saysNoSuch('show') })
  }

  // The slug predicate rides the INSERT, so a clash is a refusal, not a constraint error (0003, 0006);
  // the audit row, prices and shows ride its batch, the last two only once the product exists (0049).
  const exists = sql`EXISTS (SELECT 1 FROM pass_types WHERE id = ${id})`
  const created = await auditedWrite(db.all<{ id: string }>(sql`
    INSERT INTO pass_types (id, slug, name, description, valid_from, valid_until, sales_open_at, sales_close_at, max_issued, status)
    SELECT ${id}, ${input.slug}, ${input.name}, ${input.description ?? null}, ${input.validFrom},
           ${input.validUntil}, ${input.salesOpenAt ?? null}, ${input.salesCloseAt ?? null}, ${input.maxIssued ?? null}, 'DRAFT'
    WHERE NOT EXISTS (SELECT 1 FROM pass_types WHERE slug = ${input.slug})
    RETURNING id
  `), auditEntry({
    actorId: resolved.account.id,
    action: 'pass-type.created',
    target: `pass-type:${id}`,
    detail: { name: input.name, slug: input.slug, prices: input.prices, showCount: showIds.length },
  }), ...input.prices.map(price => db.run(sql`
    INSERT INTO pass_type_prices (id, pass_type_id, label, price)
    SELECT ${newId()}, ${id}, ${price.label}, ${price.price} WHERE ${exists}
  `)), ...showIds.map(showId => db.run(sql`
    INSERT INTO pass_type_shows (id, pass_type_id, show_id) SELECT ${newId()}, ${id}, ${showId} WHERE ${exists}
  `)))

  if (!created) {
    throw createError({ statusCode: 409, statusMessage: `A pass already has the address ${input.slug}` })
  }

  return { ok: true, id }
})
