import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

const body = z.object({
  requiresId: z.string().trim().min(1).max(32),
})

// Declare that a module requires another. Direct edges only, and the graph stays acyclic (G-108).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requireCatalogueAuthority(event)

  const held = await moduleById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such module' })
  assertStewards(resolved, held.department)

  const input = await readValidatedBodyOrThrow(event, body)

  // Criterion 4. The constraint says the same thing; this is the sentence somebody reads.
  if (input.requiresId === id) {
    throw createError({ statusCode: 409, statusMessage: 'A module cannot require itself' })
  }

  const required = await moduleById(input.requiresId)
  if (!required) throw createError({ statusCode: 404, statusMessage: 'No such module' })

  // Criterion 3. A brief gates nothing, so it can never be what another module waits on.
  if (required.kind === 'BRIEF') {
    throw createError({
      statusCode: 409,
      statusMessage: 'A brief cannot be a prerequisite: it gates nothing and never expires',
    })
  }

  const [already] = await db.select({ id: schema.modulePrerequisites.id })
    .from(schema.modulePrerequisites)
    .where(and(
      eq(schema.modulePrerequisites.moduleId, id),
      eq(schema.modulePrerequisites.requiresId, input.requiresId),
    ))
    .limit(1)
  if (already) throw createError({ statusCode: 409, statusMessage: 'That module is already required' })

  // Criterion 2. The refusal names the loop, because "that would make a cycle" is not actionable
  // when the path runs through modules the officer is not looking at.
  const loop = await cyclePath(id, input.requiresId)
  if (loop !== null) {
    throw createError({
      statusCode: 409,
      statusMessage: `Adding this would close a loop: ${id} -> ${loop}`,
    })
  }

  const edge = newId()
  await db.batch([
    db.insert(schema.modulePrerequisites).values({ id: edge, moduleId: id, requiresId: input.requiresId }),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'prerequisite.added',
      target: `module:${id}`,
      detail: { requires: input.requiresId },
    })),
  ])

  return { ok: true, id: edge }
})
