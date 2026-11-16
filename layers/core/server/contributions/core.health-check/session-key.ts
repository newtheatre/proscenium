// Red without the session key: nobody can sign in until it is set.
import type { HealthCheck } from '../../points/health-check'
import { credential } from '#kit'

export default {
  async check() {
    if (!(await credential('CORE_SESSION_KEY'))) return { state: 'failing', sentence: 'Nobody can sign in, because the session key is not set.', remedy: 'Set CORE_SESSION_KEY on the Worker to a long random string, and keep it secret.' }
    return { state: 'ok', sentence: 'The session key is set.' }
  },
} satisfies HealthCheck
