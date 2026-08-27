// Issues a verification token and asks the centre to send it. Kept in one place so registration
// and the resend path cannot drift apart (A-102).
import type { H3Event } from 'h3'

export async function sendVerification(event: H3Event, userId: string): Promise<void> {
  const { plaintext, expiresAt } = await issueToken(userId, 'EMAIL_VERIFY')
  const base = useRuntimeConfig(event).public.baseURL

  await notify(event, {
    type: 'account.verify',
    userId,
    context: {
      name: '',
      url: `${base}/verify?token=${plaintext}`,
      expiresAt,
    },
  })
}
