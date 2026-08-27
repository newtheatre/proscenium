import { defaultPasswordPolicy } from '#shared/utils/auth'
import type { PasswordPolicy } from '#shared/utils/auth'

// Filled while rendering by app/plugins/password-policy.server.ts. The shipped defaults are the
// fallback, so a form always has a rule to show even before the live one arrives.
export function usePasswordPolicy(): Ref<PasswordPolicy> {
  return useState<PasswordPolicy>('nnt-password-policy', defaultPasswordPolicy)
}
