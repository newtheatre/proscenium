import type { PasswordPolicy, PasswordProblem } from './auth'

// The hint a form shows before anything is typed. It reads the policy, because a fixed sentence
// about length goes wrong the moment the configuration asks for a symbol (0012).
export function saysPasswordPolicy(policy: PasswordPolicy): string {
  const demands = [
    ...(policy.requireMixedCase ? ['upper and lower case'] : []),
    ...(policy.requireNumber ? ['a number'] : []),
    ...(policy.requireSymbol ? ['a symbol'] : []),
  ]
  const length = `At least ${policy.minLength} characters`
  if (demands.length === 0) return `${length}. Length beats punctuation, so a few words you will remember is a good password.`
  const last = demands.pop()!
  const named = demands.length === 0 ? last : `${demands.join(', ')} and ${last}`
  return `${length}, including ${named}.`
}

// The refusal quotes the rule that refused it, so a person is not left guessing which one
// moved. Shared, so registration and reset never disagree about the wording.
export function explainPasswordProblem({ reason, policy }: PasswordProblem): string {
  switch (reason) {
    case 'workspace-address': return 'A Workspace address signs in with Google and cannot hold a password'
    case 'too-short': return `A password must be at least ${policy.minLength} characters`
    case 'too-long': return `A password must be at most ${policy.maxLength} characters`
    case 'needs-mixed-case': return 'A password must use upper and lower case'
    case 'needs-number': return 'A password must contain a number'
    case 'needs-symbol': return 'A password must contain a symbol'
  }
}
