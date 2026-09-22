import { FEEDBACK_LIMIT, feedbackForm } from '#shared/utils/feedback'
import { enforce } from '#server/utils/rate-limit'

// The application only records (0086): one row for the daily triage run, one trail line naming
// the screen and the kind and never the words (K-134 criterion 3, 0011).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  await enforce(event, { ...FEEDBACK_LIMIT, value: account.id })
  const input = await readValidatedBodyOrThrow(event, feedbackForm)

  const id = newId()
  await db.batch([
    db.insert(schema.feedbackReports).values({
      id,
      reporterId: account.id,
      kind: input.kind,
      body: input.body,
      pagePath: input.path,
      shell: input.shell,
      userAgent: input.userAgent ?? null,
      recentFailures: input.recentFailures.length ? input.recentFailures : null,
    }),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: account.id,
      action: 'feedback.submitted',
      target: `feedback:${id}`,
      detail: { kind: input.kind, path: input.path, shell: input.shell },
    })),
  ])

  return { ok: true, id }
})
