import { z } from 'zod'

const bodySchema = z.object({
  code: z.string().trim().min(6).max(10),
  /** "Sam — DSM". Skippable, and social rather than authenticated (ADR-0020). */
  name: z.string().trim().max(60).optional(),
})

/**
 * POST /api/backstage/join — join tonight's board by code. Deliberately
 * unauthenticated: the crew hold no accounts, which is the whole point.
 */
export default defineEventHandler(async (event) => {
  const { code, name } = await readValidatedBody(event, bodySchema.parse)
  const night = showNightDate()

  const { token, expiresAt } = await joinBackstage(night, code, name ?? null)

  // The token lives in a cookie and nowhere else; the code is never stored on
  // the device, so there is nothing on it to reuse tomorrow.
  setCookie(event, BACKSTAGE_COOKIE, token, {
    httpOnly: true,
    secure: !import.meta.dev,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })

  return { night, expiresAt, deviceName: name ?? null }
})
