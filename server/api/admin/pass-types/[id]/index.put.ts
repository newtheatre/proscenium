import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { passTypeForm } from '#shared/utils/pass-types'

// Edit a pass product: name, description, windows, price points and status. Covered shows move
// through their own endpoint, sometimes manager-gated (D-123 criterion 4).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await passTypeById(id)
  if (!held) throw noSuch('pass')

  const input = await readValidatedBodyOrThrow(event, passTypeForm)
  const description = input.description ?? null
  const salesOpenAt = input.salesOpenAt ?? null
  const salesCloseAt = input.salesCloseAt ?? null
  const maxIssued = input.maxIssued ?? null

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'pass-type.updated',
    target: `pass-type:${id}`,
    detail: {
      ...changes({
        slug: [held.slug, input.slug],
        name: [held.name, input.name],
        status: [held.status, input.status],
        validFrom: [held.validFrom, input.validFrom],
        validUntil: [held.validUntil, input.validUntil],
        salesOpenAt: [held.salesOpenAt, salesOpenAt],
        salesCloseAt: [held.salesCloseAt, salesCloseAt],
        maxIssued: [held.maxIssued, maxIssued],
      }),
      // Prose stays on the record; the trail records only that it moved (0011).
      descriptionChanged: description !== held.description,
    },
  })
  // The entry lands only if the update applied, so the price points move only with it.
  const applied = sql`EXISTS (SELECT 1 FROM audit_log WHERE id = ${entry.id})`

  // The address predicate rides the UPDATE, so a clashing rename refuses (0003, 0006). The prices are
  // replaced whole: a price point carries no history of its own until D-124 snapshots what was paid.
  const updated = await auditedWrite(db.all<{ id: string }>(sql`
    UPDATE pass_types
    SET slug = ${input.slug},
        name = ${input.name},
        description = ${description},
        status = ${input.status},
        valid_from = ${input.validFrom},
        valid_until = ${input.validUntil},
        sales_open_at = ${salesOpenAt},
        sales_close_at = ${salesCloseAt},
        max_issued = ${maxIssued},
        updated_at = unixepoch()
    WHERE id = ${id}
      AND NOT EXISTS (SELECT 1 FROM pass_types WHERE slug = ${input.slug} AND id <> ${id})
    RETURNING id
  `), entry, db.run(sql`DELETE FROM pass_type_prices WHERE pass_type_id = ${id} AND ${applied}`), ...input.prices.map(price => db.run(sql`
    INSERT INTO pass_type_prices (id, pass_type_id, label, price)
    SELECT ${newId()}, ${id}, ${price.label}, ${price.price} WHERE ${applied}
  `)))

  if (!updated) {
    const taken = await passTypeBySlug(input.slug, id)
    if (!taken) throw noSuch('pass')
    throw createError({ statusCode: 409, statusMessage: `A pass already has the address ${taken.slug}` })
  }

  return { ok: true }
})
