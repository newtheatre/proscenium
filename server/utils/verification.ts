// Issues a verification token and asks the centre to send it. Kept in one place so registration
// and the resend path cannot drift apart (A-102).
import type { H3Event } from 'h3'

// `boundTo` is the address the link proves. Set on a change, so a link issued for one address
// cannot confirm a later one (A-115 criterion 1).
export async function sendVerification(event: H3Event, userId: string, boundTo?: string): Promise<void> {
  const { plaintext, expiresAt } = await issueToken(userId, 'EMAIL_VERIFY', undefined, boundTo)
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
