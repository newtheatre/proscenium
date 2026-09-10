import { SHOW_STATUSES, saysShowStatus } from './programme'
import type { ListSpec } from './list-filters'

// The shows list's declaration (K-129, D-121). The season and category pickers get their options
// from the reference-data endpoints; "unassessed" and "on sale" are questions about other rows.
export const showsList: ListSpec = {
  key: 'shows',
  search: { placeholder: 'A show title or address', maxLength: 120 },
  fields: [
    {
      key: 'status',
      label: 'Status',
      kind: 'list',
      column: 'status',
      options: SHOW_STATUSES.map(status => ({ value: status, label: saysShowStatus(status) })),
      operators: ['is'],
      icon: 'i-lucide-eye',
    },
    { key: 'seasonId', label: 'Season', kind: 'search-list', column: 'season_id', cap: 12, icon: 'i-lucide-calendar-range' },
    { key: 'categoryId', label: 'Category', kind: 'search-list', column: 'category_id', cap: 12, icon: 'i-lucide-tag' },
    { key: 'unassessed', label: 'Warnings unassessed', kind: 'yes-no' },
    { key: 'onSale', label: 'On sale', kind: 'yes-no' },
  ],
  sort: {
    fields: [
      { key: 'status', label: 'Status', column: 'status' },
      { key: 'title', label: 'Title', column: 'title', collate: 'nocase' },
    ],
    default: 'status',
  },
}
