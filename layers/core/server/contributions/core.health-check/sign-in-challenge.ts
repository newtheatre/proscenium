// Red while the bot check has no secret: signing in by email refuses outright until it is set (ID-10).
import type { HealthCheck } from '../../points/health-check'
import { credential } from '#kit'

export default {
  async check() {
    if (!(await credential('CORE_TURNSTILE_SECRET_KEY'))) return { state: 'failing', sentence: 'Signing in by email is switched off because the bot check has no secret.', remedy: 'Create a Turnstile widget in Cloudflare, then save its site key and secret key on Admin > Sign-in.', to: '/admin/sign-in' }
    return { state: 'ok', sentence: 'The bot check on sign-in is set up.' }
  },
} satisfies HealthCheck
