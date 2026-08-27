import { z } from 'zod'
import { isWorkspaceEmail, normaliseEmail } from '#shared/utils/auth'
import { CONFIG_KEYS } from '#shared/utils/config'

const body = z.object({ email: z.string().email().max(320) })
const SAME_ANSWER = { ok: true, message: 'If that address has an account, a reset link is on its way' }

// Ask for a password reset link.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, body)
  const email = normaliseEmail(input.email)

  await enforce(event, {
    scope: 'password-forgot',
    value: email,
    limit: CONFIG_KEYS.VERIFY_RESEND_ATTEMPTS.default,
    windowMinutes: CONFIG_KEYS.VERIFY_RESEND_WINDOW_MINUTES.default,
  })

  // A Workspace address has no password to reset and never will (0008). The domain says so on
  // its own, so saying it back reveals nothing (A-108 criterion 5).
  if (isWorkspaceEmail(email)) {
    return { ok: true, message: 'Theatre addresses sign in with Google; there is no password to reset' }
  }

  const account = await findByEmail(email)
  if (account?.password && !account.disabled && account.anonymisedAt === null) {
    const hours = CONFIG_KEYS.PASSWORD_RESET_HOURS.default
    const { plaintext, expiresAt } = await issueToken(account.id, 'PASSWORD_RESET', hours)
    await notify(event, {
      type: 'password.reset',
      userId: account.id,
      context: { name: '', url: `${useRuntimeConfig(event).public.baseURL}/reset?token=${plaintext}`, expiresAt },
    })
  }

  return SAME_ANSWER
})
