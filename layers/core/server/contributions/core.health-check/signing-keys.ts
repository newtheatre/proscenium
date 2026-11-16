// Amber while a signing key is past its rotation date: the daily rotation has not run (F-37). The
// Health screen lists the keys from GET /api/core/signing-keys, each with Retire now.
import type { HealthCheck } from '../../points/health-check'
import { listSigningKeys } from '#kit/signing'
import { nowMs } from '#kit'

export default {
  async check() {
    const keys = await listSigningKeys()
    const overdue = keys.filter(k => k.rotationDue !== null && k.rotationDue <= nowMs())
    if (overdue.length) return { state: 'warning', sentence: `${overdue.length === 1 ? 'A signing key is' : `${overdue.length} signing keys are`} past the date it should have been replaced.`, remedy: 'Check that scheduled tasks are running: the rotation runs daily.' }
    const current = keys.filter(k => k.state === 'current').length
    return { state: 'ok', sentence: current ? `${current === 1 ? 'One signing key is' : `${current} signing keys are`} in use and up to date.` : 'No codes are signed yet.' }
  },
} satisfies HealthCheck
