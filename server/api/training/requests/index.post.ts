import { moduleRequestForm } from '#shared/utils/training'
import { COMMITTEE_ONLY_WORDS } from '#shared/utils/training-action'

// Ask for a module to be taught. It tells the department there is demand, and nothing more.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const input = await readValidatedBodyOrThrow(event, moduleRequestForm)

  const module = await modulePolicy(input.moduleId)
  if (!module) throw noSuch('module')

  // Criterion 6. A draft is not offered yet and a retired one takes nothing new, so neither is
  // a thing to ask for.
  if (module.status !== 'ACTIVE') {
    throw createError({
      statusCode: 409,
      statusMessage: 'That module is not being taught at the moment, so there is nothing to ask for',
    })
  }

  // G-105 criterion 8: nobody off the committee puts themselves forward for its own training (0115).
  if (module.committeeOnly && !(await hasCommitteeRole(account.id))) {
    throw createError({ statusCode: 403, statusMessage: `${COMMITTEE_ONLY_WORDS}: asking for it needs a committee role` })
  }

  const id = newId()
  try {
    await db.insert(schema.moduleRequests).values({
      id,
      userId: account.id,
      moduleId: input.moduleId,
      note: input.note,
    })
  }
  catch {
    // Criterion 1 is the partial unique index, so the second ask is refused by the database
    // rather than by a read that another request could have raced.
    throw createError({
      statusCode: 409,
      statusMessage: 'You have already asked for this one, and it is still waiting',
    })
  }

  return { ok: true, id }
})
