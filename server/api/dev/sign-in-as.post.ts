import { z } from 'zod'

const body = z.object({ userId: z.string().min(1).max(64) })

// Sign in as anybody, without their password (K-124). This is an authentication bypass, which is
// why nuxt.config keeps this file out of a production build rather than guarding it at runtime.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, body)

  const account = await findById(input.userId)
  if (!account) throw createError({ statusCode: 404, statusMessage: 'No such account' })
  if (account.anonymisedAt !== null) {
    throw createError({ statusCode: 409, statusMessage: 'That account is a tombstone: there is nobody to be' })
  }

  // The same session every other path writes, so what is being tested is the real thing (0007).
  await startSession(event, account)
  return { ok: true, name: account.name }
})
