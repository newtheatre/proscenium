// The sample "shows" list: built-in views, filters of several kinds, sorts apart from columns, and
// rows that open to show performances.
import { defineList } from '../../../../../layers/core/shared/list'

export const showsList = defineList('gallery.shows', {
  filters: {
    state: { kind: 'choices', label: 'State', options: [{ value: 'draft', label: 'Draft' }, { value: 'on-sale', label: 'On sale' }, { value: 'past', label: 'Past' }] },
    listed: { kind: 'yes-no', label: 'Listed' },
    opens: { kind: 'dates', label: 'Opens', presets: [{ value: 'next30d', label: 'Next 30 days' }, { value: '30d', label: 'Last 30 days' }] },
  },
  sorts: {
    title: { label: 'Title', type: 'text' },
    opens: { label: 'Opening night', type: 'date' },
    changed: { label: 'Last changed', type: 'date', natural: 'desc' },
  },
  columns: {
    title: { label: 'Show', sort: 'title', always: true, card: true },
    opens: { label: 'Opens', sort: 'opens', card: true },
    state: { label: 'State', card: true },
    venue: { label: 'Venue', hidden: true },
  },
  views: {
    next: { label: 'Now and next', filters: { state: 'on-sale' }, sort: 'opens', open: true },
    drafts: { label: 'Drafts', filters: { state: 'draft' }, sort: 'changed' },
    all: { label: 'All' },
  },
  defaultView: 'next',
  defaultSort: { key: 'title', order: 'asc' },
  subRows: { max: 20 },
})
