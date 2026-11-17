// Identity's lists: what a person can filter, sort and search by. The server binds them to the
// tables in server/lists. Their search indexes are also what findAccounts and the person picker read
// (Identity Doc part 4, "Finding rows by a person's name or email").
import { defineList } from './list'

/**
 * Accounts: the console's People list (Identity Doc part 5, "Accounts"), searched by name and the
 * name the person goes by. Unclaimed and anonymised accounts are hidden unless looked for, through
 * the state filter or a view. Labels are the English fallback; the page shows translated ones.
 */
export const accountsList = defineList('core.accounts', {
  filters: {
    state: {
      kind: 'choices',
      label: 'State',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'unclaimed', label: 'Not yet signed in' },
        { value: 'disabled', label: 'Disabled' },
        { value: 'anonymised', label: 'Erased' },
      ],
    },
  },
  sorts: {
    name: { label: 'Name', type: 'text' },
  },
  columns: {
    name: { label: 'Name', sort: 'name', always: true, card: true },
    preferredName: { label: 'Known as', hidden: true },
    state: { label: 'State', card: true },
    since: { label: 'Since' },
  },
  views: {
    people: { label: 'People', filters: { state: 'active,disabled' } },
    unclaimed: { label: 'Not yet signed in', filters: { state: 'unclaimed' } },
    anonymised: { label: 'Erased', filters: { state: 'anonymised' } },
    all: { label: 'All' },
  },
  defaultView: 'people',
  defaultSort: { key: 'name', order: 'asc' },
})

/**
 * Who holds what (Identity Doc part 5): every grant with its holder, role, reach and end. The
 * holder is found by name or address through findAccounts; role and module options are the
 * theatre's own, supplied by the page. The default view is what is in force or about to be.
 */
export const grantsList = defineList('core.grants', {
  filters: {
    state: {
      kind: 'choices',
      label: 'State',
      options: [
        { value: 'live', label: 'In force' },
        { value: 'pending', label: 'Not yet in force' },
        { value: 'lapsing', label: 'About to lapse' },
        { value: 'ended', label: 'Ended' },
      ],
    },
    role: { kind: 'choice', label: 'Role' },
    scope: {
      kind: 'choice',
      label: 'Reach',
      options: [
        { value: 'site', label: 'Everywhere' },
        { value: 'module', label: 'One module' },
        { value: 'record', label: 'One record' },
      ],
    },
    module: { kind: 'choice', label: 'Module' },
  },
  sorts: {
    ends: { label: 'Ends', type: 'date', natural: 'asc' },
  },
  columns: {
    person: { label: 'Person', always: true, card: true },
    role: { label: 'Role', card: true },
    scope: { label: 'Reach' },
    ends: { label: 'Ends', sort: 'ends', card: true },
    state: { label: 'State', card: true },
  },
  views: {
    current: { label: 'Current', filters: { state: 'live,pending,lapsing' } },
    lapsing: { label: 'About to lapse', filters: { state: 'lapsing' } },
    ended: { label: 'Ended', filters: { state: 'ended' } },
  },
  defaultView: 'current',
  defaultSort: { key: 'ends', order: 'asc' },
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
