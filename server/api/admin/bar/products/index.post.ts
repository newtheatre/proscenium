import { sql } from 'drizzle-orm'
import { productForm } from '#shared/utils/bar'

// Add a product. It arrives hidden: going on the till is its own decision, and its own refusal.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'bar.write')
  const input = await readValidatedBodyOrThrow(event, productForm)
  const id = newId()

  if (!await categoryById(input.categoryId)) {
    throw createError({ statusCode: 404, statusMessage: 'No such category' })
  }

  // The predicate rides the write, so two managers naming the same thing at once produce one
  // product and a refusal rather than a constraint error (0003, 0006).
  const created = await db.all<{ id: string }>(sql`
    INSERT INTO bar_products (id, category_id, name, status, staffed_only, age_restricted, allergen_state, allergen_note, sort)
    SELECT ${id}, ${input.categoryId}, ${input.name}, 'HIDDEN', ${input.staffedOnly ? 1 : 0},
           ${input.ageRestricted ? 1 : 0}, ${input.allergenState}, ${input.allergenNote ?? null}, ${input.sort}
    WHERE NOT EXISTS (SELECT 1 FROM bar_products WHERE name = ${input.name} COLLATE NOCASE)
    RETURNING id
  `)

  if (created.length === 0) {
    const taken = await productNamed(input.name)
    throw createError({ statusCode: 409, statusMessage: `A product is already called ${taken?.name ?? input.name}` })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'bar.product.created',
    target: `bar-product:${id}`,
    detail: {
      name: input.name,
      categoryId: input.categoryId,
      ageRestricted: input.ageRestricted,
      allergenState: input.allergenState,
    },
  }))

  return { ok: true, id }
})
