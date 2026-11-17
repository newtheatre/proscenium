// Health: the optional Cloudflare token (C-52). Reports only whether it is set and whether
// Cloudflare answers it, never the token itself.
import type { HealthCheck } from '../../points/health-check'
import { cloudflareToken, tokenReaches } from '../../notifications/cloudflare'

export default {
  async check() {
    if (!(await cloudflareToken())) return { state: 'ok', sentence: 'No Cloudflare token is set, so the sending domain is set up by hand.' }
    if (!await tokenReaches()) return { state: 'warning', sentence: 'The Cloudflare token is set, but Cloudflare does not accept it.', remedy: 'Make a new token with Email Sending edit and Zone read, and save it under Cloudflare token on Admin > Email sending.' }
    return { state: 'ok', sentence: 'The Cloudflare token is set and Cloudflare accepts it.' }
  },
} satisfies HealthCheck
