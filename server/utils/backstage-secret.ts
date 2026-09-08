// The worker secret behind every board code (E-120). Read fresh, never memoised as key material
// the way `access-profile-crypto.ts` imports one, because HMAC signing takes the raw string.
export function backstageBoardSecret(): string {
  const raw = useRuntimeConfig().backstageBoardSecret
  if (!raw) throw createError({ statusCode: 500, statusMessage: 'The backstage board is not configured' })
  return raw
}
