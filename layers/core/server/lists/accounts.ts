// The accounts list's binding, and the search index on core_accounts that findAccounts and the
// person picker read: a person's name and the name they go by.
import { or, sql, type SQL } from 'drizzle-orm'
import { defineListSource } from '#kit'
import { accounts } from '../db/identity'
import { accountsList } from '../../shared/identity-lists'

/** Each state an account can be in, as one condition. An erased account is in no other state. */
const STATES: Record<string, SQL> = {
  active: sql`(${accounts.anonymisedAt} IS NULL AND ${accounts.firstSignedInAt} IS NOT NULL AND ${accounts.disabledAt} IS NULL)`,
  unclaimed: sql`(${accounts.anonymisedAt} IS NULL AND ${accounts.firstSignedInAt} IS NULL AND ${accounts.disabledAt} IS NULL)`,
  disabled: sql`(${accounts.anonymisedAt} IS NULL AND ${accounts.disabledAt} IS NOT NULL)`,
  anonymised: sql`(${accounts.anonymisedAt} IS NOT NULL)`,
}

export function accountState(row: { anonymisedAt: number | null, disabledAt: number | null, firstSignedInAt: number | null }): 'active' | 'unclaimed' | 'disabled' | 'anonymised' {
  if (row.anonymisedAt) return 'anonymised'
  if (row.disabledAt) return 'disabled'
  return row.firstSignedInAt ? 'active' : 'unclaimed'
}

export default defineListSource(accountsList, {
  table: accounts,
  filters: {
    state: { where: (values: string[]) => or(...values.map(v => STATES[v]!))! },
  },
  sorts: {
    name: { columns: ['name'], index: 'core_accounts_name' },
  },
  search: { name: 'name', preferredName: 'preferredName', state: false, since: false },
})
