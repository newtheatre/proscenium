// The routes that send email declare core's bot challenge (ID-10). The kit lets a challenge pass
// quietly when the theatre has not set its secret; sign-in by email refuses outright instead, and
// the health check stays red until the secret is set.
import { credential, refuse } from '#kit'

export async function requireChallengeSecret(): Promise<void> {
  if (!(await credential('CORE_TURNSTILE_SECRET_KEY')))
    refuse('core.sign-in.unavailable', 'Signing in by email is not available yet.', { status: 503, remedy: 'The theatre needs to finish setting up its bot check. Sign in with a passkey, or try again later.' })
}
