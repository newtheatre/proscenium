// The worker secret behind every board code (E-120). Read fresh, never memoised as key material
// the way `access-profile-crypto.ts` imports one, because HMAC signing takes the raw string.
export function backstageBoardSecret(): string {
  const raw = useRuntimeConfig().backstageBoardSecret
  // Which secret is missing is the operator's to know, never the reader's (K-128 criterion 2).
  if (!raw) {
    console.error('runtime config: backstageBoardSecret is not set')
    throw createError({ statusCode: 500, statusMessage: 'This part of the site is not set up yet. Tell the IT Manager.' })
  }
  return raw
}
