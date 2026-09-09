import { sql } from 'drizzle-orm'
import { discountForm } from '#shared/utils/discounts'

// Add a bar discount. Its percentage is checked against the configured cap here, at the write
// path, so a settings change takes effect without a deploy (0012, F-117 criterion 1).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'bar.write')
  const input = await readValidatedBodyOrThrow(event, discountForm)

  const cap = await configValue(event, 'BAR_DISCOUNT_MAX_PERCENT')
  if (input.percent > cap) {
    throw createError({ statusCode: 409, statusMessage: `A discount cannot exceed ${cap}%: ${input.name} asked for ${input.percent}%` })
  }

  const id = newId()

  // The predicate rides the write, so two managers naming the same thing at once produce one
  // discount and a refusal rather than a constraint error (0003, 0006).
  const created = await db.all<{ id: string }>(sql`
    INSERT INTO discounts (id, name, percent, status, created_by, updated_by)
    SELECT ${id}, ${input.name}, ${input.percent}, 'ACTIVE', ${resolved.account.id}, ${resolved.account.id}
    WHERE NOT EXISTS (SELECT 1 FROM discounts WHERE name = ${input.name} COLLATE NOCASE)
    RETURNING id
  `)

  if (created.length === 0) {
    const taken = await discountNamed(input.name)
    throw createError({ statusCode: 409, statusMessage: `A discount is already called ${taken?.name ?? input.name}` })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'bar.discount.created',
    target: `bar-discount:${id}`,
    detail: { name: input.name, percent: input.percent },
  }))

  return { ok: true, id }
})
