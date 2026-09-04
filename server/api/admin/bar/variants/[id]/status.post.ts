import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { londonDayOf } from '#shared/utils/ledger'
import { variantStatusForm } from '#shared/utils/bar'

// Retire a serving size, or put it back. Retiring takes it off the till and touches no historical
// line, no movement and no price row (F-112 criterion 5).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await variantById(id, londonDayOf(new Date()))
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such serving size' })

  const { status } = await readValidatedBodyOrThrow(event, variantStatusForm)
  if (status === held.status) {
    throw createError({
      statusCode: 409,
      statusMessage: status === 'RETIRED' ? `${held.label} is already retired` : `${held.label} is not retired`,
    })
  }

  // The predicate rides the write, so a second request racing the same change finds nothing
  // left to change rather than writing a second audit entry for one transition (0003).
  const updated = await db.all<{ id: string }>(sql`
    UPDATE product_variants SET status = ${status} WHERE id = ${id} AND status = ${held.status}
    RETURNING id
  `)
  if (updated.length === 0) {
    throw createError({
      statusCode: 409,
      statusMessage: status === 'RETIRED' ? `${held.label} is already retired` : `${held.label} is not retired`,
    })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'bar.variant.status.changed',
    target: `bar-variant:${id}`,
    detail: changes({ status: [held.status, status] }),
  }))

  return { ok: true, status }
})
