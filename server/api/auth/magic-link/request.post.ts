import { z } from 'zod'
import { isWorkspaceEmail, normaliseEmail } from '#shared/utils/auth'

const body = z.object({ email: z.string().email().max(320) })
const SAME_ANSWER = { ok: true, message: 'If that address has an account, a sign-in link is on its way' }

// Ask for a sign-in link.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, body)
  const email = normaliseEmail(input.email)

  await enforce(event, {
    scope: 'magic-link',
    value: email,
    limit: await configValue(event, 'VERIFY_RESEND_ATTEMPTS'),
    windowMinutes: await configValue(event, 'VERIFY_RESEND_WINDOW_MINUTES'),
  })

  // Silently ignored for a Workspace address: those sign in with Google only (A-107 criterion 5).
  if (isWorkspaceEmail(email)) return SAME_ANSWER

  const account = await findByEmail(email)
  if (account && !account.disabled && account.anonymisedAt === null) {
    const minutes = await configValue(event, 'MAGIC_LINK_MINUTES')
    const { plaintext, expiresAt } = await issueToken(account.id, 'MAGIC_LINK', minutes / 60)
    await notify(event, {
      type: 'account.magic-link',
      userId: account.id,
      context: { name: '', url: `${useRuntimeConfig(event).public.baseURL}/magic?token=${plaintext}`, expiresAt },
    })
  }

  return SAME_ANSWER
})
