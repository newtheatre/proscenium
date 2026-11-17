// The search index on core_account_emails that findAccounts and the person picker read. Whether an
// address is verified is a condition on the row, not on the index.
import { defineListSource } from '#kit'
import { accountEmails } from '../db/identity'
import { accountEmailsList } from '../../shared/identity-lists'

export default defineListSource(accountEmailsList, {
  table: accountEmails,
  filters: {},
  sorts: {
    address: { columns: ['address'], index: 'core_account_emails_address' },
  },
  search: { address: 'address' },
})
