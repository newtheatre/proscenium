// Setup, step 3: the page sends back one of the codes it showed, then the Owner is written and signed in, strongly.
import { z } from 'zod'
import { changeSetting, defineRoute, newId, nowMs, refuse, sealColumn, useSetting } from '#kit'
import { normaliseOrigin, requestUrl } from '#kit/origin'
import { clearTicket, readTicket, requireSetupNeeded, writeOwner } from '../../../identity/setup'
import { digest, normaliseRecoveryCode } from '../../../identity/crypto'
import { startSession } from '../../../identity/sessions'
import { ensureModuleDefaults } from '../../../identity/defaults'
import { switchOnAtSetup } from '#kit/modules-store'

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
  for (const [i, code] of ticket.codes.entries()) params.push(newId('rcc', { random: true }), accountId, await digest('recovery', code), await sealColumn(code), i, nowMs())
  unit.add({ sql: `INSERT INTO core_recovery_codes (id, account_id, code_hash, code_sealed, position, created_at) VALUES ${ticket.codes.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')}`, params })
  await startSession(unit, event, { accountId, methods: ['setup', 'passkey'], assurance: 'strong' })
  unit.audit({ action: 'create', record: ['core.account', accountId], detail: { setup: true } })
  // The address setup ran on becomes the site's one origin, unless the Worker names it already.
  const origin = normaliseOrigin(requestUrl(event).origin)
  if (origin && !(await useSetting('core.site.origin'))) await changeSetting(unit, 'core.site.origin', origin, { confirm: true })
  // The theatre's details from setup's second step, in the same batch as the Owner.
  if (ticket.theatre) {
    await changeSetting(unit, 'core.site.name', ticket.theatre.name)
    await changeSetting(unit, 'core.locale.time-zone', ticket.theatre.timeZone, { confirm: true })
    await changeSetting(unit, 'core.organisation.country', ticket.theatre.country)
    if (ticket.theatre.contactEmail) await changeSetting(unit, 'core.organisation.contact-email', ticket.theatre.contactEmail)
  }
  // Modules a new site starts with (maintenance mode, so the site stays closed until the Owner opens it).
  await switchOnAtSetup(unit)
  unit.afterCommit(() => clearTicket(event))
  // Core is always on, so its roles and fact mappings are made with the site rather than on a switch.
  unit.afterCommit(async () => {
    await ensureModuleDefaults('core', accountId)
  })
  return { next: '/admin' }
})
