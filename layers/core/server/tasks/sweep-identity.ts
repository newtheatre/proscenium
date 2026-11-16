// Hourly: forget spent and expired sign-in tokens and passkey challenges, and sessions that have
// ended or run out. None of them can be used again, so keeping them only keeps hashes about. Then
// addresses people added and never verified are removed once core.sign-in.unverified-address-lifetime
// has passed (ID-12).
import { defineTask, nowMs } from '#kit'
import { sweepUnverifiedAddresses } from '../identity/my-addresses'

export default defineTask(async (unit) => {
  const at = nowMs()
  unit.add({ sql: 'DELETE FROM core_account_tokens WHERE expires_at <= ?', params: [at] })
  unit.add({ sql: 'DELETE FROM core_passkey_challenges WHERE expires_at <= ? OR used_at IS NOT NULL', params: [at] })
  unit.add({ sql: 'DELETE FROM core_sessions WHERE ended_at IS NOT NULL OR expires_at <= ?', params: [at] })
  await sweepUnverifiedAddresses(unit)
})
