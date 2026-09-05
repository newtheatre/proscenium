import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { stockItemForm } from '#shared/utils/bar'

// Edit a stocked item. Its unit and container size are fixed once stock has moved, because every
// quantity already written is stated in them (0017, audit PR-12).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await itemById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such stocked item' })

  const input = await readValidatedBodyOrThrow(event, stockItemForm)
  const containerMl = input.containerMl ?? null

  // The trigger would refuse this anyway. The refusal here is the one that says what to do next.
  if (held.hasMovements && (input.unit !== held.unit || containerMl !== held.containerMl)) {
    throw createError({
      statusCode: 409,
      statusMessage: `${held.name} has stock movements, so its unit and container size are fixed: retire it and add it again`,
    })
  }

  const updated = await db.all<{ id: string }>(sql`
    UPDATE bar_items
    SET name = ${input.name},
        unit = ${input.unit},
        container_ml = ${containerMl},
        par_qty = ${input.parQty ?? null},
        category = ${input.category ?? null},
        age_restricted = ${input.ageRestricted ? 1 : 0},
        allergen_notes = ${input.allergenNotes ?? null}
    WHERE id = ${id}
      AND NOT EXISTS (SELECT 1 FROM bar_items WHERE name = ${input.name} COLLATE NOCASE AND id <> ${id})
    RETURNING id
  `)

  if (updated.length === 0) {
    const taken = await itemNamed(input.name, id)
    if (!taken) throw createError({ statusCode: 404, statusMessage: 'No such stocked item' })
    throw createError({ statusCode: 409, statusMessage: `A stocked item is already called ${taken.name}` })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'bar.item.updated',
    target: `bar-item:${id}`,
    // The allergen notes are prose, so the trail records that they moved and never what they say.
    detail: {
      ...changes({
        name: [held.name, input.name],
        unit: [held.unit, input.unit],
        containerMl: [held.containerMl, containerMl],
        parQty: [held.parQty, input.parQty ?? null],
        category: [held.category, input.category ?? null],
        ageRestricted: [held.ageRestricted, input.ageRestricted],
      }),
      allergenNotesChanged: (input.allergenNotes ?? null) !== held.allergenNotes,
    },
  }))

  return { ok: true }
})
