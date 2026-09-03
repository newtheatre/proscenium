import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { productForm } from '#shared/utils/bar'

// Edit a product. Its status is a separate decision, so this does not take one.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await productById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such product' })

  const input = await readValidatedBodyOrThrow(event, productForm)
  if (!await categoryById(input.categoryId)) {
    throw createError({ statusCode: 404, statusMessage: 'No such category' })
  }

  const note = input.allergenNote ?? null

  // The name predicate rides the UPDATE, so a rename onto a name somebody is taking at the same
  // moment refuses rather than reaching the unique index (0003, 0006).
  const updated = await db.all<{ id: string }>(sql`
    UPDATE bar_products
    SET name = ${input.name},
        category_id = ${input.categoryId},
        sort = ${input.sort},
        staffed_only = ${input.staffedOnly ? 1 : 0},
        age_restricted = ${input.ageRestricted ? 1 : 0},
        allergen_state = ${input.allergenState},
        allergen_note = ${note}
    WHERE id = ${id}
      AND NOT EXISTS (SELECT 1 FROM bar_products WHERE name = ${input.name} COLLATE NOCASE AND id <> ${id})
    RETURNING id
  `)

  if (updated.length === 0) {
    const taken = await productNamed(input.name, id)
    if (!taken) throw createError({ statusCode: 404, statusMessage: 'No such product' })
    throw createError({ statusCode: 409, statusMessage: `A product is already called ${taken.name}` })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'bar.product.updated',
    target: `bar-product:${id}`,
    // The allergen note is prose, so the trail records that it moved and never what it says (0011).
    detail: {
      ...changes({
        name: [held.name, input.name],
        categoryId: [held.categoryId, input.categoryId],
        sort: [held.sort, input.sort],
        staffedOnly: [held.staffedOnly, input.staffedOnly],
        ageRestricted: [held.ageRestricted, input.ageRestricted],
        allergenState: [held.allergenState, input.allergenState],
      }),
      allergenNoteChanged: note !== held.allergenNote,
    },
  }))

  return { ok: true }
})
