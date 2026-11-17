// Incidents: the reviewers' list binding. Search is by incident number only, applied by the route;
// nothing free-text or personal is searched.
import { defineListSource } from '#kit'
import { incidents } from '../db/schema'
import { incidentsList } from '../../shared/lists'

export default defineListSource(incidentsList, {
  table: incidents,
  filters: {
    state: { column: 'state' },
    severity: { column: 'severity' },
    kind: { column: 'kind' },
    venue: { column: 'venueId' },
    occurred: { column: 'occurredAt' },
  },
  sorts: {
    number: { columns: ['year', 'number'], index: 'front_of_house_incidents_number' },
  },
  search: { reference: false, occurred: false, kind: false, severity: false, state: false, venue: false, actions: false },
})
