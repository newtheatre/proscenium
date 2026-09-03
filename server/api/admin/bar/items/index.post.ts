import { sql } from 'drizzle-orm'
import { stockItemForm } from '#shared/utils/bar'

// Add a stocked item, with the unit it is counted in.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'bar.write')
  const input = await readValidatedBodyOrThrow(event, stockItemForm)
  const id = newId()

  // The predicate rides the write, so two managers naming the same thing at once produce one
  // item and a refusal rather than a constraint error (0003, 0006).
  const created = await db.all<{ id: string }>(sql`
    INSERT INTO bar_items (id, name, unit, container_ml, par_qty, age_restricted, allergen_notes, status)
    SELECT ${id}, ${input.name}, ${input.unit}, ${input.containerMl ?? null}, ${input.parQty ?? null},
           ${input.ageRestricted ? 1 : 0}, ${input.allergenNotes ?? null}, 'ACTIVE'
    WHERE NOT EXISTS (SELECT 1 FROM bar_items WHERE name = ${input.name} COLLATE NOCASE)
    RETURNING id
  `)

  if (created.length === 0) {
    const taken = await itemNamed(input.name)
    throw createError({ statusCode: 409, statusMessage: `A stocked item is already called ${taken?.name ?? input.name}` })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'bar.item.created',
    target: `bar-item:${id}`,
    detail: { name: input.name, unit: input.unit, containerMl: input.containerMl ?? null },
  }))

  return { ok: true, id }
})
