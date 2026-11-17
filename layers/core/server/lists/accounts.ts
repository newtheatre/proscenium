// The accounts list's binding, and the search index on core_accounts that findAccounts and the
// person picker read: a person's name and the name they go by.
import { defineListSource } from '#kit'
import { accounts } from '../db/identity'
import { accountsList } from '../../shared/identity-lists'

export default defineListSource(accountsList, {
  table: accounts,
  filters: {},
  sorts: {
    name: { columns: ['name'], index: 'core_accounts_name' },
  },
  search: { name: 'name', preferredName: 'preferredName' },
})
