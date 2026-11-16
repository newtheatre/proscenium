// Roles and grants as staff change them (ID-22, ID-23, ID-29). The rules that hold whatever is
// held: nobody grants themselves, nobody gives what they do not have, only an Owner changes an
// Owner, and no change leaves the theatre without an Owner who can sign in.
import { all, first, newId, nowMs, refuse, useSetting, type Actor, type UnitView } from '#kit'
import { useRegistry } from '#kit/registry'
import { LIVE, OWNER, guardLastOwner, isOwner, kitGrantsOf, roleAbilities, withImplied } from './grants'
import { accountById } from './accounts'

export interface RoleRow {
  id: string
  key: string
  name: string
  description: string | null
  fixed: number
  opens_members_area: number
  needs_managed_identity: number
  expiry_rule: 'year_end' | 'days' | 'none'
  expiry_days: number | null
  archived_at: number | null
}

export type Scope = { kind: 'site' } | { kind: 'module', module: string } | { kind: 'record', module: string, type: string, id: string }

export async function roleById(id: string): Promise<RoleRow | null> {
  return first<RoleRow>('SELECT * FROM core_roles WHERE id = ?', id)
}

/**
 * The abilities in `wanted` the actor does not hold at the scope. An Owner holds everything. A
 * grant at a wider scope covers a narrower one.
 */
export async function notHeld(actor: Actor, wanted: string[], scope: Scope = { kind: 'site' }): Promise<string[]> {
  if (!actor.accountId) return wanted
  if (await isOwner(actor.accountId)) return []
  const grants = await kitGrantsOf(actor.accountId)
  return wanted.filter(ability => !grants.some((g) => {
    if (g.ability !== ability) return false
    if (!g.record) return true
    return scope.kind === 'record' && g.record.type === scope.type && g.record.id === scope.id
  }))
}

function abilityError(missing: string[]): never {
  refuse('core.role.not-held', 'You can only give abilities you hold yourself.', { status: 403, remedy: `Ask someone who holds ${missing.join(', ')} to do this.` })
}

export function checkAbilities(abilities: string[]): string[] {
  const registry = useRegistry()
  const unknown = abilities.filter(a => !registry.abilities.has(a))
  if (unknown.length) refuse('core.input.invalid', 'Some abilities do not exist.', { status: 422, fields: { abilities: unknown.join(', ') } })
  return withImplied(abilities)
}

function slug(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'role' // not-policy: characters a key may hold
}

export interface RoleInput {
  name: string
  description?: string | null
  abilities: string[]
  expiryRule: 'year_end' | 'days' | 'none'
  expiryDays?: number | null
  opensMembersArea: boolean
}

async function checkExpiryRule(input: RoleInput): Promise<void> {
  if (input.expiryRule === 'none' && !(await useSetting('core.grants.allow-no-expiry')))
    refuse('core.role.needs-expiry', 'Roles must end: this theatre does not allow roles with no end date.', { status: 422, remedy: 'Choose the year end or a number of days.' })
  if ((input.expiryRule === 'days') !== (input.expiryDays != null))
    refuse('core.input.invalid', 'Give a number of days only for a role that ends after a number of days.', { status: 422, fields: { expiryDays: 'required with days, and only then' } })
}

// Makes a role (ID-22). Its abilities, and what they imply, must all be held by the actor.
export async function createRole(unit: UnitView, actor: Actor, input: RoleInput): Promise<string> {
  const abilities = checkAbilities(input.abilities)
  const missing = await notHeld(actor, abilities)
  if (missing.length) abilityError(missing)
  await checkExpiryRule(input)
  const base = slug(input.name)
  const taken = new Set((await all<{ key: string }>('SELECT key FROM core_roles WHERE key = ? OR key LIKE ?', base, `${base}-%`)).map(r => r.key))
  let key = base
  for (let n = 2; taken.has(key); n++) key = `${base}-${n}`
  const id = newId('rol')
  unit.add({
    sql: 'INSERT INTO core_roles (id, key, name, description, fixed, opens_members_area, needs_managed_identity, expiry_rule, expiry_days, created_at) VALUES (?, ?, ?, ?, 0, ?, 0, ?, ?, ?)',
    params: [id, key, input.name, input.description ?? null, input.opensMembersArea ? 1 : 0, input.expiryRule, input.expiryDays ?? null, nowMs()],
  })
  writeAbilities(unit, id, abilities)
  unit.announce('core.role.changed', { roleId: id }, { record: ['core.role', id] })
  unit.audit({ action: 'create', record: ['core.role', id], detail: { abilities: abilities.length } })
  return id
}

function writeAbilities(unit: UnitView, roleId: string, abilities: string[]): void {
  unit.add({ sql: 'DELETE FROM core_role_abilities WHERE role_id = ?', params: [roleId] })
  if (abilities.length) unit.add({ sql: `INSERT INTO core_role_abilities (role_id, ability) VALUES ${abilities.map(() => '(?, ?)').join(', ')}`, params: abilities.flatMap(a => [roleId, a]) })
}

function refuseFixed(role: RoleRow | null): asserts role is RoleRow {
  if (!role) refuse('core.not-found', 'There is no such role.', { status: 404 })
  if (role.fixed || role.key === OWNER) refuse('core.role.fixed', 'The Owner role cannot be changed.', { status: 409 })
}

/** Changes a role. Abilities it gains must be held by the actor; the Owner role is fixed. */
export async function updateRole(unit: UnitView, actor: Actor, id: string, input: RoleInput): Promise<void> {
  const role = await roleById(id)
  refuseFixed(role)
  if (role.archived_at) refuse('core.role.archived', 'This role is archived.', { status: 409 })
  const abilities = checkAbilities(input.abilities)
  const before = new Set(await roleAbilities(id))
  const missing = await notHeld(actor, abilities.filter(a => !before.has(a)))
  if (missing.length) abilityError(missing)
  await checkExpiryRule(input)
  unit.add({
    sql: 'UPDATE core_roles SET name = ?, description = ?, opens_members_area = ?, expiry_rule = ?, expiry_days = ? WHERE id = ? AND archived_at IS NULL',
    params: [input.name, input.description ?? null, input.opensMembersArea ? 1 : 0, input.expiryRule, input.expiryDays ?? null, id],
  }).expect(1)
  writeAbilities(unit, id, abilities)
  unit.announce('core.role.changed', { roleId: id }, { record: ['core.role', id] })
  unit.audit({ action: 'update', record: ['core.role', id], detail: { abilities: abilities.length } })
}

/** Archives a role; every live grant of it ends at once. */
export async function archiveRole(unit: UnitView, actor: Actor, id: string): Promise<void> {
  const role = await roleById(id)
  refuseFixed(role)
  const at = nowMs()
  unit.add({ sql: 'UPDATE core_roles SET archived_at = ? WHERE id = ? AND archived_at IS NULL', params: [at, id] })
    .expect(1, { code: 'core.role.archived', reason: 'This role is already archived.' })
  const live = await all<{ id: string, account_id: string }>(`SELECT g.id, g.account_id FROM core_grants g WHERE g.role_id = ? AND ${LIVE}`, id, at, at)
  if (live.length) {
    unit.add({ sql: `INSERT INTO core_grant_ends (grant_id, ended_at, ended_by, ended_reason) VALUES ${live.map(() => '(?, ?, ?, \'role_archived\')').join(', ')}`, params: live.flatMap(g => [g.id, at, actor.accountId ?? null]) })
    for (const g of live) unit.announce('core.grant.ended', { grantId: g.id, accountId: g.account_id, roleId: id, reason: 'role_archived' }, { record: ['core.grant', g.id] })
  }
  unit.audit({ action: 'state', record: ['core.role', id], detail: { archived: true, grantsEnded: live.length } })
}

export interface GrantInput { accountId: string, roleId: string, scope: Scope, expiresAt?: number | null }

/** The end date a new grant gets: what was given, or what the role's rule says. */
async function endDate(role: RoleRow, given: number | null | undefined): Promise<number | null> {
  const at = nowMs()
  if (given != null) {
    if (given <= at) refuse('core.input.invalid', 'The end date must be in the future.', { status: 422, fields: { expiresAt: 'in the past' } })
    return given
  }
  if (role.expiry_rule === 'days') return at + role.expiry_days! * 86_400_000 // not-policy: milliseconds in a day
  // The committee year end comes from the core domain's year pattern, which is not built yet, so
  // a year-end role needs its end date given for now.
  if (role.expiry_rule === 'year_end') refuse('core.grant.needs-end-date', 'This role ends at the year end. Give the end date.', { status: 422, fields: { expiresAt: 'required' } })
  if (role.key !== OWNER && !(await useSetting('core.grants.allow-no-expiry'))) refuse('core.grant.needs-end-date', 'Roles must end. Give the end date.', { status: 422, fields: { expiresAt: 'required' } })
  return null
}

/**
 * Gives a role (ID-23). The database refuses a self-grant too; the "one live grant" rule is a
 * guarded insert, so two requests at once make one grant.
 */
export async function createGrant(unit: UnitView, actor: Actor, input: GrantInput, options: { endedGrant?: string, newAccount?: boolean } = {}): Promise<string> {
  if (input.accountId === actor.accountId) refuse('core.grant.self', 'You cannot give yourself a role.', { status: 403, remedy: 'Ask someone else who can give roles.' })
  // An account made earlier in this unit is not in the database yet, and is live by definition.
  if (!options.newAccount) {
    const account = await accountById(input.accountId)
    if (!account || account.merged_into_id || account.anonymised_at) refuse('core.not-found', 'There is no such person.', { status: 404 })
    if (account.disabled_at) refuse('core.account.disabled', 'This account is disabled.', { status: 409, remedy: 'Enable it first.' })
  }
  const role = await roleById(input.roleId)
  if (!role || role.archived_at) refuse('core.not-found', 'There is no such role.', { status: 404 })
  if (role.key === OWNER) {
    if (!actor.accountId || !(await isOwner(actor.accountId))) refuse('core.owner.only-owner', 'Only an Owner can make someone an Owner.', { status: 403 })
    if (input.scope.kind !== 'site') refuse('core.input.invalid', 'Owner is given for the whole site.', { status: 422, fields: { scope: 'site only' } })
  }
  const missing = await notHeld(actor, await roleAbilities(role.id, role.key), input.scope)
  if (missing.length) abilityError(missing)
  const expiresAt = await endDate(role, input.expiresAt)
  const at = nowMs()
  const id = newId('gra')
  const scope = input.scope
  const module = scope.kind === 'site' ? null : scope.module
  const type = scope.kind === 'record' ? scope.type : null
  const recordId = scope.kind === 'record' ? scope.id : null
  unit.add({
    sql: `INSERT INTO core_grants (id, account_id, role_id, scope, scope_module, scope_type, scope_id, starts_at, expires_at, granted_by, granted_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE NOT EXISTS (SELECT 1 FROM core_grants g WHERE g.account_id = ? AND g.role_id = ? AND g.scope = ? AND g.scope_module IS ? AND g.scope_type IS ? AND g.scope_id IS ? AND ${LIVE})`,
    params: [id, input.accountId, role.id, scope.kind, module, type, recordId, at, expiresAt, actor.accountId ?? null, at, input.accountId, role.id, scope.kind, module, type, recordId, at, at],
  }).expect(1, { code: 'core.grant.already-held', reason: 'This person already holds this role there.', remedy: 'Change the existing grant instead.' })
  unit.announce('core.grant.created', { grantId: id, accountId: input.accountId, roleId: role.id }, { record: ['core.grant', id] })
  unit.audit({ action: 'grant', record: ['core.grant', id], detail: { accountId: input.accountId, roleId: role.id, scope: scope.kind, ...(options.endedGrant ? { replaces: options.endedGrant } : {}) } })
  return id
}

export interface GrantRow { id: string, account_id: string, role_id: string, scope: Scope['kind'], scope_module: string | null, scope_type: string | null, scope_id: string | null, expires_at: number | null, role_key: string }

export async function grantById(id: string): Promise<GrantRow | null> {
  return first<GrantRow>('SELECT g.*, r.key AS role_key FROM core_grants g JOIN core_roles r ON r.id = g.role_id WHERE g.id = ?', id)
}

export function scopeOf(grant: GrantRow): Scope {
  if (grant.scope === 'module') return { kind: 'module', module: grant.scope_module! }
  if (grant.scope === 'record') return { kind: 'record', module: grant.scope_module!, type: grant.scope_type!, id: grant.scope_id! }
  return { kind: 'site' }
}

// Ends a grant (ID-23, ID-29). It stops counting on the holder's next request.
export async function endGrant(unit: UnitView, actor: Actor, id: string, reason: 'revoked' | 'replaced' = 'revoked', options: { guard?: boolean } = {}): Promise<GrantRow> {
  const grant = await grantById(id)
  if (!grant) refuse('core.not-found', 'There is no such grant.', { status: 404 })
  if (grant.role_key === OWNER && (!actor.accountId || !(await isOwner(actor.accountId)))) refuse('core.owner.only-owner', 'Only an Owner can end someone\'s Owner role.', { status: 403 })
  const missing = await notHeld(actor, await roleAbilities(grant.role_id, grant.role_key), scopeOf(grant))
  if (missing.length) abilityError(missing)
  const at = nowMs()
  unit.add({
    sql: 'INSERT INTO core_grant_ends (grant_id, ended_at, ended_by, ended_reason) SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM core_grant_ends WHERE grant_id = ?) AND EXISTS (SELECT 1 FROM core_grants g WHERE g.id = ? AND (g.expires_at IS NULL OR g.expires_at > ?))',
    params: [id, at, actor.accountId ?? null, reason, id, id, at],
  }).expect(1, { code: 'core.grant.already-ended', reason: 'This grant has already ended.' })
  if (grant.role_key === OWNER && options.guard !== false) guardLastOwner(unit)
  unit.announce('core.grant.ended', { grantId: id, accountId: grant.account_id, roleId: grant.role_id, reason }, { record: ['core.grant', id] })
  unit.audit({ action: 'grant', record: ['core.grant', id], detail: { ended: reason } })
  return grant
}

// Changes a grant: it ends and a new one is written; the history shows both (ID-23).
export async function changeGrant(unit: UnitView, actor: Actor, id: string, change: { expiresAt?: number | null, scope?: Scope }): Promise<string> {
  const grant = await endGrant(unit, actor, id, 'replaced', { guard: false })
  const next = await createGrant(unit, actor, { accountId: grant.account_id, roleId: grant.role_id, scope: change.scope ?? scopeOf(grant), expiresAt: change.expiresAt }, { endedGrant: id })
  if (grant.role_key === OWNER) guardLastOwner(unit)
  return next
}
