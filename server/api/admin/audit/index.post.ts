import { z } from 'zod'
import { MANUAL_ACTION_NAMES, isManualAction } from '#shared/utils/audit-actions'
import type { AuditActionName } from '#shared/utils/audit-actions'

const body = z.object({
  action: z.enum(MANUAL_ACTION_NAMES as [AuditActionName, ...AuditActionName[]]),
  // The person the entry is about, and the person it is recorded on behalf of. Both are account
  // references: the trail never names somebody it cannot later anonymise (0011, 0027).
  target: z.string().max(64),
  onBehalfOf: z.string().max(64),
  occurredAt: z.number().int().positive(),
  detail: z.record(z.string().max(60), z.union([z.string().max(120), z.number(), z.boolean(), z.null()])).default({}),
})

// Record an action taken outside the system (J-103 criteria 2 and 3).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'audit.write')
  const input = await readValidatedBodyOrThrow(event, body)

  // Belt and braces over the schema: the namespace is the rule, and a manual entry claiming a
  // system action would be indistinguishable from one in every report that reads this table.
  if (!isManualAction(input.action)) {
    throw createError({ statusCode: 400, statusMessage: 'A manual entry records a manual.* action' })
  }

  // Signed from a session that answered a second factor. Every sign-in path challenges an account
  // that holds one, so holding one is the fact this resolves from rather than the cookie (0009).
  await requireFreshSession(event)
  if (!await confirmedFactor(resolved.account.id)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'A manual entry is signed, so it needs an authenticator on your account',
      data: { enrol: '/account/security' },
    })
  }

  if (input.occurredAt * 1000 > Date.now()) {
    throw createError({ statusCode: 400, statusMessage: 'That date has not happened yet' })
  }

  for (const [label, id] of [['subject', input.target], ['person it is recorded for', input.onBehalfOf]] as const) {
    if (!await findById(id)) {
      throw createError({ statusCode: 400, statusMessage: `The ${label} is not an account on this system` })
    }
  }

  const entry = auditEntry({
    // The signer, and the only authoritative record of who entered it: detail can be redacted,
    // and this field cannot be rewritten at all (0010).
    actorId: resolved.account.id,
    action: input.action,
    target: `user:${input.target}`,
    detail: { ...input.detail, onBehalfOf: `user:${input.onBehalfOf}`, occurredAt: input.occurredAt },
  })

  await db.insert(schema.auditLog).values(entry)

  return { ok: true, id: entry.id }
})
