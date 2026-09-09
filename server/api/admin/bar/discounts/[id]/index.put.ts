import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { discountForm } from '#shared/utils/discounts'

// Edit a bar discount. Every sale already charged keeps its own snapshot, so this never restates
// what was actually charged, only what applying it does from now on (F-117 criterion 3).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await discountById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such discount' })

  const input = await readValidatedBodyOrThrow(event, discountForm)

  const cap = await configValue(event, 'BAR_DISCOUNT_MAX_PERCENT')
  if (input.percent > cap) {
    throw createError({ statusCode: 409, statusMessage: `A discount cannot exceed ${cap}%: ${input.name} asked for ${input.percent}%` })
  }

  // The name predicate rides the UPDATE, so a rename onto a name somebody is taking at the same
  // moment refuses rather than reaching the unique index (0003, 0006).
  const updated = await db.all<{ id: string }>(sql`
    UPDATE discounts
    SET name = ${input.name}, percent = ${input.percent}, updated_by = ${resolved.account.id}, updated_at = unixepoch()
    WHERE id = ${id}
      AND NOT EXISTS (SELECT 1 FROM discounts WHERE name = ${input.name} COLLATE NOCASE AND id <> ${id})
    RETURNING id
  `)

  if (updated.length === 0) {
    const taken = await discountNamed(input.name, id)
    if (!taken) throw createError({ statusCode: 404, statusMessage: 'No such discount' })
    throw createError({ statusCode: 409, statusMessage: `A discount is already called ${taken.name}` })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'bar.discount.updated',
    target: `bar-discount:${id}`,
    detail: changes({
      name: [held.name, input.name],
      percent: [held.percent, input.percent],
    }),
  }))

  return { ok: true }
})
