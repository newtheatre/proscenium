// Disabling an account (ID-31): every session ends in the same batch and no new one starts;
// nothing is deleted. Refused for one's own account (the ability's owner rule) and when it would
// leave no Owner who can sign in (ID-29).
import { nowMs, refuse, type UnitView } from '#kit'
import { accountById } from './accounts'
import { guardLastOwner, isOwner } from './grants'
import { endSessionsOf } from './sessions'

export async function disableAccount(unit: UnitView, id: string, reason: 'security' | 'conduct' | 'requested' | 'duplicate'): Promise<void> {
  const account = await accountById(id)
  if (!account || account.merged_into_id || account.anonymised_at) refuse('core.not-found', 'There is no such person.', { status: 404 })
  unit.add({ sql: 'UPDATE core_accounts SET disabled_at = ?, disabled_reason = ? WHERE id = ? AND disabled_at IS NULL', params: [nowMs(), reason, id] })
    .expect(1, { code: 'core.account.already-disabled', reason: 'This account is already disabled.' })
  endSessionsOf(unit, id, 'disabled')
  if (await isOwner(id)) guardLastOwner(unit)
  unit.announce('core.account.disabled', { accountId: id }, { record: ['core.account', id] })
  unit.audit({ action: 'state', record: ['core.account', id], detail: { disabled: true, reason } })
}

export async function enableAccount(unit: UnitView, id: string): Promise<void> {
  unit.add({ sql: 'UPDATE core_accounts SET disabled_at = NULL, disabled_reason = NULL WHERE id = ? AND disabled_at IS NOT NULL', params: [id] })
    .expect(1, { code: 'core.account.not-disabled', reason: 'This account is not disabled.' })
  unit.announce('core.account.enabled', { accountId: id }, { record: ['core.account', id] })
  unit.audit({ action: 'state', record: ['core.account', id], detail: { disabled: false } })
}
