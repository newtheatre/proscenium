import { eq } from 'drizzle-orm'
import { assessmentProblem, levelProblem, showWarningsForm } from '#shared/utils/content-warnings'

// Set what a show warns about. Free text never reaches this table: the body carries vocabulary ids
// and a level, and the two rules a CHECK cannot state are held here (D-102 criteria 1 and 2).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const show = await showById(id)
  if (!show) throw createError({ statusCode: 404, statusMessage: 'No such show' })

  const input = await readValidatedBodyOrThrow(event, showWarningsForm)

  const contradiction = assessmentProblem(input.confirmedNone, input.warnings.length)
  if (contradiction) throw createError({ statusCode: 409, statusMessage: contradiction })

  // Archived entries stay usable only where the show already carries one, so retiring a warning
  // cannot rewrite a published show's page behind its back.
  const vocabulary = await warningKinds(id)
  for (const warning of input.warnings) {
    const entry = vocabulary.get(warning.warningId)
    if (!entry) throw createError({ statusCode: 400, statusMessage: 'That warning is not in the vocabulary' })
    const problem = levelProblem(entry.kind, warning.level)
    if (problem) throw createError({ statusCode: 400, statusMessage: `${entry.title}: ${problem}` })
  }

  const held = await showWarnings(id)

  // Replaced in one batch: a partial write would leave a published show warning about half of
  // what it warns about, which is worse than the old answer (0001).
  await db.batch([
    db.delete(schema.showContentWarnings).where(eq(schema.showContentWarnings.showId, id)),
    ...input.warnings.map(warning => db.insert(schema.showContentWarnings).values({
      id: newId(),
      showId: id,
      warningId: warning.warningId,
      level: warning.level,
    })),
    db.update(schema.shows)
      .set({ warningsConfirmedNone: input.confirmedNone, updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(schema.shows.id, id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'show.warnings.set',
      target: `show:${id}`,
      // Slugs and a count, never a person and never prose (0011).
      detail: {
        confirmedNone: input.confirmedNone,
        was: held.map(warning => warning.slug),
        now: input.warnings.map(warning => vocabulary.get(warning.warningId)?.slug ?? warning.warningId),
      },
    })),
  ])

  return { ok: true }
})
