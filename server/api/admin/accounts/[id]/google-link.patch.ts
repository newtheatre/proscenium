import { eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  PRELINK_LOST_RACE,
  preLinkAddress,
  preLinkDetail,
  preLinkHolderStatement,
  preLinkRefusal,
  preLinkStatement,
} from '#shared/utils/google-prelink'
import type { PreLinkHolder } from '#shared/utils/google-prelink'

// Null clears it. Checked as an address here; whether it is a Workspace one is a refusal below.
const body = z.object({ googleEmail: z.string().trim().email().max(320).nullable() })

async function target(id: string) {
  const [row] = await db.select({
    googleSub: schema.users.googleSub,
    anonymisedAt: schema.users.anonymisedAt,
    pendingGoogleEmail: schema.users.pendingGoogleEmail,
  }).from(schema.users).where(eq(schema.users.id, id)).limit(1)
  return row
}

async function holderOf(id: string, email: string | null): Promise<PreLinkHolder | null> {
  if (email === null) return null
  const [row] = await db.all<PreLinkHolder>(preLinkHolderStatement(id, email))
  return row ?? null
}

// Set or clear the Workspace address an account's first Google sign-in claims (A-104 criterion 6).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'accounts.create')
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, body)
  const email = preLinkAddress(input.googleEmail)

  const [account, holder] = await Promise.all([target(id), holderOf(id, email)])
  if (!account) throw noSuch('account')

  const refusal = preLinkRefusal(account, email, holder)
  if (refusal) throw createError(refusal)
  if (account.pendingGoogleEmail === email) return { ok: true, googleEmail: email, changed: false }

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: email === null ? 'account.google.unlinked' : 'account.google.prelinked',
    target: `user:${id}`,
    detail: email === null ? undefined : preLinkDetail(account.pendingGoogleEmail !== null),
  })
  if (await auditedWrite(db.all<{ id: string }>(preLinkStatement(id, email)), entry)) {
    return { ok: true, googleEmail: email, changed: true }
  }

  // The predicate refused it: something changed between the read and the write, so say what.
  const [now, lateHolder] = await Promise.all([target(id), holderOf(id, email)])
  if (now && now.pendingGoogleEmail === email) return { ok: true, googleEmail: email, changed: false }
  const late = now ? preLinkRefusal(now, email, lateHolder) : null
  throw createError(late ?? { statusCode: 409, statusMessage: PRELINK_LOST_RACE })
})
