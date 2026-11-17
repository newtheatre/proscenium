// Till sessions: the list's binding. Search is by who opened the session, through findAccounts,
// applied by the route.
import { defineListSource } from '#kit'
import { sessions } from '../db/schema'
import { sessionsList } from '../../shared/lists'

export default defineListSource(sessionsList, {
  table: sessions,
  filters: {
    state: { column: 'state' },
    opened: { column: 'openedAt' },
  },
  sorts: {
    opened: { columns: ['openedAt'], index: 'payments_sessions_opened' },
  },
  search: { till: false, person: false, opened: false, state: false, expected: false, counted: false, difference: false },
})
