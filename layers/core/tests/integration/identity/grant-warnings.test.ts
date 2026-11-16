// Warnings that roles are about to lapse (ID-24): the holder hears once about all their roles
// ending, whoever could renew them hears once with a count, and nobody hears twice.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { newId } from '#kit'
import { createUnit } from '#kit/unit'
import { deliver, env, grantDirectly, leaveIdentity, reset, setSetting, staff, useIdentity } from './helpers'
import { inContext, rows } from '../../../../../tests/integration/helpers'
import { setMailer, useMailer, type OutgoingEmail } from '../../../server/notifications/mailer'
import { warnOfLapsingGrants } from '../../../server/identity/grant-warnings'

const sent: OutgoingEmail[] = []
const DAY = 86_400_000 // not-policy: a day in milliseconds

beforeAll(async () => {
  await useIdentity()
  const inner = useMailer()
  setMailer(async (email) => {
    sent.push(email)
    return inner(email)
  })
})
afterAll(leaveIdentity)
beforeEach(async () => {
  reset()
  sent.length = 0
  await setSetting('core.locale.time-zone', 'Europe/London')
})

const to = (addressee: string) => sent.filter(e => e.to === addressee)
const addressOf = async (accountId: string) => (await rows<{ address: string }>('SELECT address FROM core_account_emails WHERE account_id = ?', accountId))[0]!.address

/** A role with these abilities, granted to the account until `endsIn` from now. */
async function roleEnding(accountId: string, name: string, abilities: string[], endsIn: number): Promise<string> {
  const roleId = newId('rol')
  const at = Date.now()
  await env.DB.prepare('INSERT INTO core_roles (id, key, name, fixed, opens_members_area, needs_managed_identity, expiry_rule, created_at) VALUES (?, ?, ?, 0, 1, 0, \'none\', ?)').bind(roleId, `role-${roleId.slice(-10)}`, name, at).run()
  for (const ability of abilities) await env.DB.prepare('INSERT INTO core_role_abilities (role_id, ability) VALUES (?, ?)').bind(roleId, ability).run()
  const grantId = newId('gra')
  await env.DB.prepare('INSERT INTO core_grants (id, account_id, role_id, scope, starts_at, expires_at, granted_by, granted_at) VALUES (?, ?, ?, \'site\', ?, ?, \'acc_testgranter\', ?)')
    .bind(grantId, accountId, roleId, at - 1000, at + endsIn, at - 1000).run() // not-policy: a moment ago
  return grantId
}

async function sweep() {
  await inContext(async () => {
    const unit = createUnit()
    await warnOfLapsingGrants(unit)
    await unit.commit()
  })
  await deliver()
}

describe('roles about to lapse (ID-24)', () => {
  it('tells the holder once about every role ending, and whoever could renew them once, with a count', async () => {
    await env.DB.prepare('DELETE FROM core_grant_warnings').run()
    const holder = await staff()
    const renewer = await staff()
    const cannot = await staff()
    await grantDirectly(renewer.accountId, ['core.grant.manage', 'core.role.read', 'core.access-scheme.read'])
    // Holds core.grant.manage but not core.access-scheme.read, so could not give the second role.
    await grantDirectly(cannot.accountId, ['core.grant.manage', 'core.role.read'])
    const first = await roleEnding(holder.accountId, 'Box office lead', ['core.role.read'], 3 * DAY)
    const second = await roleEnding(holder.accountId, 'Technical director', ['core.access-scheme.read'], 10 * DAY)
    const later = await roleEnding(holder.accountId, 'Bar manager', ['core.role.read'], 40 * DAY)
    await deliver()
    sent.length = 0

    await sweep()
    await sweep()

    const mine = to(await addressOf(holder.accountId))
    expect(mine.map(e => e.subject)).toEqual(['A role of yours at The Test Theatre is ending'])
    expect(mine[0]!.text).toContain('Box office lead')
    expect(mine[0]!.text).toContain('Technical director')
    expect(mine[0]!.text).not.toContain('Bar manager')

    const theirs = to(await addressOf(renewer.accountId))
    expect(theirs.map(e => e.subject)).toEqual(['Roles at The Test Theatre are about to lapse'])
    expect(theirs[0]!.text).toContain('Roles you can renew are about to lapse: 2')

    const partial = to(await addressOf(cannot.accountId))
    expect(partial.map(e => e.text.includes('about to lapse: 1'))).toEqual([true])

    const warned = await rows<{ grant_id: string }>('SELECT grant_id FROM core_grant_warnings ORDER BY grant_id')
    expect(warned.map(w => w.grant_id).sort()).toEqual([first, second].sort())
    expect(warned.map(w => w.grant_id)).not.toContain(later)
  })

  it('reads how far ahead from core.grants.expiry-warning', async () => {
    await env.DB.prepare('DELETE FROM core_grant_warnings').run()
    const holder = await staff()
    await setSetting('core.grants.expiry-warning', 45 * 86_400)
    const later = await roleEnding(holder.accountId, 'Bar manager', ['core.role.read'], 40 * DAY)
    await deliver()
    sent.length = 0
    await sweep()
    expect((await rows<{ grant_id: string }>('SELECT grant_id FROM core_grant_warnings')).map(w => w.grant_id)).toContain(later)
    await env.DB.prepare('DELETE FROM core_settings WHERE key = ?').bind('core.grants.expiry-warning').run()
  })
})
