import type { H3Event } from 'h3'

// The set-password link a console-made account is sent (A-121 criterion 3, A-132 criterion 5).
// Never for a Workspace address, which signs in with Google and may hold no password (0008).
export async function inviteToSetPassword(event: H3Event, userId: string, name: string): Promise<void> {
  const { plaintext, expiresAt } = await issueToken(userId, 'SET_PASSWORD', await configValue(event, 'ADMIN_TOKEN_HOURS'))
  await notify(event, {
    type: 'account.set-password',
    userId,
    context: {
      name,
      url: `${useRuntimeConfig(event).public.baseURL}/reset?token=${plaintext}&kind=set`,
      expiresAt,
    },
  })
}
