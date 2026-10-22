import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { PASSKEY_LABEL_MAX, passkeyLabelProblem } from '#shared/utils/sign-in-methods'

const body = z.object({ label: z.string().max(PASSKEY_LABEL_MAX * 2, 'That is too long') })

// Name one of this account's passkeys. Only its owner, and only a passkey: the rest have fixed names.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, body)

  const problem = passkeyLabelProblem(input.label)
  if (problem) throw createError({ statusCode: 400, statusMessage: problem })

  // The name is whatever the owner calls their device, so the trail records only that it changed.
  const [renamed] = await db.batch([
    db.update(schema.passkeys)
      .set({ label: input.label.trim() })
      .where(and(eq(schema.passkeys.id, id), eq(schema.passkeys.userId, account.id)))
      .returning({ id: schema.passkeys.id }),
    db.run(auditIfChanged(auditEntry({
      actorId: account.id,
      action: 'account.method.renamed',
      target: `user:${account.id}`,
      detail: { method: 'passkey' },
    }))),
  ])
  if (renamed.length === 0) throw noSuch('passkey')

  return { ok: true }
})
