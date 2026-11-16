// Hourly: forget spent and expired sign-in tokens and passkey challenges, and sessions that have
// ended or run out. None of them can be used again, so keeping them only keeps hashes about.
import { defineTask, nowMs } from '#kit'

export default defineTask((unit) => {
  const at = nowMs()
  unit.add({ sql: 'DELETE FROM core_account_tokens WHERE expires_at <= ?', params: [at] })
  unit.add({ sql: 'DELETE FROM core_passkey_challenges WHERE expires_at <= ? OR used_at IS NOT NULL', params: [at] })
  unit.add({ sql: 'DELETE FROM core_sessions WHERE ended_at IS NOT NULL OR expires_at <= ?', params: [at] })
})
