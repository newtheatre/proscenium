import type { PasswordProblem } from './auth'

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
