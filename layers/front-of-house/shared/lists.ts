// Front of house's declared lists (Front of house specification, part 5, "Console"): what a person
// can filter, sort and search by. The sources in server/lists bind each key to the table.
import { defineList } from '#kit/list-declaration'

/** Incidents for reviewers: no free text and no people, so nothing personal is in the list. */
export const incidentsList = defineList('front-of-house.incidents', {
  filters: {
    state: {
      kind: 'choices',
      label: 'State',
      options: [
        { value: 'reported', label: 'Awaiting review' },
        { value: 'in_review', label: 'In review' },
        { value: 'closed', label: 'Closed' },
      ],
    },
    severity: {
      kind: 'choices',
      label: 'Severity',
      options: [
        { value: 'minor', label: 'Minor' },
        { value: 'moderate', label: 'Moderate' },
        { value: 'serious', label: 'Serious' },
      ],
    },
    kind: {
      kind: 'choice',
      label: 'Kind',
      options: [
        { value: 'incident', label: 'Incident' },
        { value: 'near_miss', label: 'Near miss' },
      ],
    },
    // The theatre's own venues, which the page supplies.
    venue: { kind: 'choice', label: 'Venue' },
    occurred: {
      kind: 'dates',
      label: 'Happened',
      presets: [
        { value: '7d', label: 'Last 7 days' },
        { value: '30d', label: 'Last 30 days' },
        { value: '365d', label: 'Last year' },
      ],
    },
  },
  sorts: {
    number: { label: 'Number', type: 'number', natural: 'desc' },
  },
  columns: {
    reference: { label: 'Number', sort: 'number', always: true, card: true },
    occurred: { label: 'Happened', card: true },
    kind: { label: 'Kind' },
    severity: { label: 'Severity', card: true },
    state: { label: 'State', card: true },
    venue: { label: 'Venue' },
    actions: { label: 'Open actions', hidden: true },
  },
  views: {
    waiting: { label: 'Awaiting review', filters: { state: 'reported' } },
    open: { label: 'Not closed', filters: { state: 'reported,in_review' } },
    all: { label: 'All' },
  },
  defaultView: 'waiting',
  defaultSort: { key: 'number', order: 'desc' },
})
