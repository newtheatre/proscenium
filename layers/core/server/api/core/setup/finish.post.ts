// Setup, step 3: one recovery code typed back, then the Owner is written and signed in, strongly.
import { z } from 'zod'
import { defineRoute, newId, nowMs, refuse } from '#kit'
import { clearTicket, readTicket, requireSetupNeeded, writeOwner } from '../../../identity/setup'
import { digest, normaliseRecoveryCode } from '../../../identity/crypto'
import { startSession } from '../../../identity/sessions'

export default defineRoute({
  public: true,
  rateLimit: 'sign-in',
  input: z.object({ code: z.string().max(40) }), // not-policy: a recovery code is eleven characters
}, async (event, { input, unit }) => {
  await requireSetupNeeded()
  const ticket = await readTicket(event)
  if (!ticket.credential || !ticket.codes) refuse('core.setup.passkey-needed', 'Add a passkey before finishing.', { status: 409 })
  if (!ticket.codes.includes(normaliseRecoveryCode(input.code)))
    refuse('core.setup.code-wrong', 'That is not one of your recovery codes.', { status: 422, remedy: 'Type one of the codes exactly as shown.' })
  const { accountId } = writeOwner(unit, { ...ticket, credential: ticket.credential })
  const params: unknown[] = []
  for (const code of ticket.codes) params.push(newId('rcc', { random: true }), accountId, await digest('recovery', code), nowMs())
  unit.add({ sql: `INSERT INTO core_recovery_codes (id, account_id, code_hash, created_at) VALUES ${ticket.codes.map(() => '(?, ?, ?, ?)').join(', ')}`, params })
  await startSession(unit, event, { accountId, methods: ['setup', 'passkey'], assurance: 'strong' })
  unit.audit({ action: 'create', record: ['core.account', accountId], detail: { setup: true } })
  unit.afterCommit(() => clearTicket(event))
  return { next: '/' }
})
