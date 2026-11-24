// Roles given on one record by the module that owns it, such as a budget's holders (Budgets BC-14),
// under that module's own ability instead of core.grant.manage. giveRole's and endGrant's rules hold.
import { all, first, nowMs, refuse, type Actor, type UnitView } from '#kit'
import { useRegistry } from '#kit/registry'
import { HOLDER, LIVE } from './grants'
import { endGrant, giveRole, grantById, type Scope } from './roles'
import { roleNotice } from './notices'

export type RecordRef = readonly [type: string, id: string]

export interface RecordGrant { id: string, accountId: string, name: string, roleId: string, roleName: string, expiresAt: number | null }

function scopeOn(record: RecordRef): Extract<Scope, { kind: 'record' }> {
  const declared = useRegistry().records.get(record[0])
  if (!declared) throw new Error(`"${record[0]}" is not a declared record type`)
  return { kind: 'record', module: declared.module, type: record[0], id: record[1] }
}

/** The live grants given on this record, with the holder's name and the role's. */
export async function grantsOn(record: RecordRef): Promise<RecordGrant[]> {
  const at = nowMs()
  return all<RecordGrant>(
    `SELECT g.id, ${HOLDER} AS accountId, coalesce(a.name, '') AS name, r.id AS roleId, r.name AS roleName, g.expires_at AS expiresAt
       FROM core_grants g JOIN core_roles r ON r.id = g.role_id AND r.archived_at IS NULL
       JOIN core_accounts a ON a.id = ${HOLDER}
      WHERE g.scope = 'record' AND g.scope_type = ? AND g.scope_id = ? AND a.anonymised_at IS NULL AND ${LIVE}
      ORDER BY a.name, g.granted_at`,
    record[0], record[1], at, at,
  )
}

/** Gives the role with this key on the record; refused when the theatre has archived or removed it. */
export async function giveRoleOn(unit: UnitView, actor: Actor, input: { accountId: string, roleKey: string, record: RecordRef }): Promise<{ id: string, expiresAt: number | null }> {
  const role = await first<{ id: string }>('SELECT id FROM core_roles WHERE key = ? AND archived_at IS NULL', input.roleKey)
  if (!role) refuse('core.role.missing', 'The role this needs has been archived.', { status: 409, remedy: 'Restore it, or make a role with that key, under Admin > Roles.' })
  const given = await giveRole(unit, actor, { accountId: input.accountId, roleId: role.id, scope: scopeOn(input.record) })
  await roleNotice(unit, input.accountId, role.id, { given: true, expiresAt: given.expiresAt })
  return given
}

/** Ends a grant given on this record, and no other. */
export async function endGrantOn(unit: UnitView, actor: Actor, grantId: string, record: RecordRef): Promise<void> {
  const grant = await grantById(grantId)
  if (!grant || grant.scope !== 'record' || grant.scope_type !== record[0] || grant.scope_id !== record[1]) refuse('core.not-found', 'There is no such grant here.', { status: 404 })
  await endGrant(unit, actor, grantId)
  await roleNotice(unit, grant.account_id, grant.role_id, { given: false })
}
