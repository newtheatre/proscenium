// Identity's lists: what a person can filter, sort and search by. The server binds them to the
// tables in server/lists. Their search indexes are also what findAccounts and the person picker read
// (Identity Doc part 4, "Finding rows by a person's name or email").
import { defineList } from './list'

/** Accounts, searched by name and the name the person goes by. */
export const accountsList = defineList('core.accounts', {
  filters: {},
  sorts: {
    name: { label: 'Name', type: 'text' },
  },
  columns: {
    name: { label: 'Name', sort: 'name', always: true },
    preferredName: { label: 'Known as' },
  },
  defaultSort: { key: 'name', order: 'asc' },
})

/** Email addresses, searched by the address itself. Only verified ones ever find a person. */
export const accountEmailsList = defineList('core.account-emails', {
  filters: {},
  sorts: {
    address: { label: 'Address', type: 'text' },
  },
  columns: {
    address: { label: 'Address', sort: 'address', always: true },
  },
  defaultSort: { key: 'address', order: 'asc' },
})
