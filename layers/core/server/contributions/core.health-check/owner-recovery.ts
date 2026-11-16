// Red while the break-glass secret is set (ID-09): it should be set only for the minutes it is used.
import type { HealthCheck } from '../../points/health-check'
import { credential } from '#kit'

export default {
  async check() {
    if (await credential('CORE_OWNER_RECOVERY')) return { state: 'failing', sentence: 'The Owner recovery secret is set, so anyone who has it can add a passkey to an Owner.', remedy: 'Remove CORE_OWNER_RECOVERY from the Worker\'s secrets as soon as the Owner is back in.' }
    return { state: 'ok', sentence: 'Owner recovery is shut.' }
  },
} satisfies HealthCheck
