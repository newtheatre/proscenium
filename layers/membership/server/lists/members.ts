// Members: the staff list's binding. Status is worked out from the dates and today (D1), and search
// is by member number or by the person through findAccounts, so the route applies both.
import { sql } from 'drizzle-orm'
import { defineListSource } from '#kit'
import { memberships } from '../db/schema'
import { membersList } from '../../shared/lists'

export default defineListSource(membersList, {
  table: memberships,
  filters: {
    status: { where: () => sql`1` },
    scheme: { column: 'schemeId' },
  },
  sorts: {
    joined: { columns: ['startsOn'], bounded: 10_000 }, // not-policy: the deepest a list pages
  },
  search: { name: false, number: false, scheme: false, status: false, until: false, joined: false },
})
