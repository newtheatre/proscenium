// Emergency contacts, for members (ID-17; part 3, "Emergency contacts"). Members' side only: a
// person writes and staff read them only while the person holds a standing. A staff read is one
// person at a time, with a reason from a fixed list, audited, and shown to the person.
import { all, newId, nowMs, refuse, useSetting, type Actor, type UnitView } from '#kit'
import { hasStanding } from './standings'

export const READ_REASONS = ['emergency', 'incident', 'welfare-follow-up', 'activity-check'] as const
export type ReadReason = typeof READ_REASONS[number]

export const MAX_CONTACTS = 3 // not-policy: the spec fixes up to three (ID-17)

export interface EmergencyContact { name: string, relationship: string | null, phone: string }

const ABILITY = 'core.emergency-contact.read'

export async function contactsOf(accountId: string): Promise<Array<EmergencyContact & { updatedAt: number }>> {
  const rows = await all<{ name: string, relationship: string | null, phone: string, updated_at: number }>(
    'SELECT name, relationship, phone, updated_at FROM core_emergency_contacts WHERE account_id = ? ORDER BY rowid', accountId,
  )
  return rows.map(r => ({ name: r.name, relationship: r.relationship, phone: r.phone, updatedAt: r.updated_at }))
}

/** Replaces the person's contacts with these, in order. The caller has checked they are on the members' side. */
export function saveContacts(unit: UnitView, accountId: string, contacts: EmergencyContact[]): void {
  if (contacts.length > MAX_CONTACTS) refuse('core.emergency-contacts.too-many', `Up to ${MAX_CONTACTS} contacts can be kept.`, { status: 422 })
  const at = nowMs()
  unit.add({ sql: 'DELETE FROM core_emergency_contacts WHERE account_id = ?', params: [accountId] })
  for (const c of contacts) {
    unit.add({
      sql: 'INSERT INTO core_emergency_contacts (id, account_id, name, relationship, phone, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [newId('emc'), accountId, c.name, c.relationship, c.phone, at],
    })
  }
}

/**
 * Staff read one person's contacts (the service `emergencyContactsOf`). The caller holds the
 * ability over the account (the route checks it). Without a standing the answer is empty; either
 * way the read is audited with its reason, and the person sees it.
 */
export async function emergencyContactsOf(unit: UnitView, actor: Actor, accountId: string, reason: ReadReason): Promise<EmergencyContact[]> {
  if (!READ_REASONS.includes(reason)) refuse('core.input.invalid', 'Choose why you are reading these.', { status: 422, fields: { reason: 'required' } })
  const holds = await hasStanding({ kind: 'person', accountId })
  unit.audit({ action: 'read', ability: ABILITY, record: ['core.account', accountId], detail: { reason, found: holds } })
  if (!holds) return []
  return (await contactsOf(accountId)).map(({ name, relationship, phone }) => ({ name, relationship, phone }))
}

export interface ContactRead { at: number, capacity: string, reason: string }

/**
 * Every staff read of the person's contacts: when, in what capacity (the role, or the fact the
 * theatre mapped the ability to) and why. Not who: the person sees the capacity, as the spec says.
 */
export async function readsOf(accountId: string): Promise<ContactRead[]> {
  const rows = await all<{ at: number, allowed_by: string | null, detail: string | null, role_name: string | null }>(
    `SELECT a.at, a.allowed_by, a.detail, r.name AS role_name
       FROM core_audit a
       LEFT JOIN core_grants g ON a.allowed_by = 'grant:' || g.id
       LEFT JOIN core_roles r ON r.id = g.role_id
      WHERE a.record_type = 'core.account' AND a.record_id = ? AND a.ability = ? AND a.action = 'read'
      ORDER BY a.at DESC`,
    accountId, ABILITY,
  )
  return rows.map(r => ({
    at: r.at,
    capacity: r.role_name ?? (r.allowed_by?.startsWith('fact:') ? r.allowed_by.slice('fact:'.length) : 'staff'),
    reason: (r.detail ? JSON.parse(r.detail).reason : null) ?? 'unknown',
  }))
}

/**
 * The daily part of the identity sweep: an account with contacts but no standing is marked the
 * first time it is seen, and its contacts are deleted once `core.emergency-contacts.keep-after-standing`
 * has passed since. A standing that returns first clears the mark, so a gap between two
 * memberships loses nothing.
 */
export async function sweepEmergencyContacts(unit: UnitView): Promise<void> {
  const at = nowMs()
  const keep = (await useSetting('core.emergency-contacts.keep-after-standing') as number) * 1000 // not-policy: seconds to milliseconds
  const accounts = await all<{ account_id: string, lost: number | null }>(
    'SELECT account_id, max(standing_lost_at) AS lost FROM core_emergency_contacts GROUP BY account_id',
  )
  for (const { account_id: accountId, lost } of accounts) {
    const holds = await hasStanding({ kind: 'person', accountId })
    if (holds && lost !== null) unit.add({ sql: 'UPDATE core_emergency_contacts SET standing_lost_at = NULL WHERE account_id = ?', params: [accountId] })
    else if (!holds && lost === null) unit.add({ sql: 'UPDATE core_emergency_contacts SET standing_lost_at = ? WHERE account_id = ?', params: [at, accountId] })
    if (!holds && (lost ?? at) + keep <= at) unit.add({ sql: 'DELETE FROM core_emergency_contacts WHERE account_id = ?', params: [accountId] })
  }
}
