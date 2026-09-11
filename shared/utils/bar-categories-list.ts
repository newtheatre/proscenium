import { MAX_BAR_NAME } from './bar'
import type { ListSpec } from './list-filters'

// The till categories' declaration (K-129, F-111). Nothing on the row is filterable yet; the
// order is read at request time, so sort is the whole of it.
export const barCategoriesList = {
  key: 'bar-categories',
  search: { placeholder: 'A category', maxLength: MAX_BAR_NAME },
  fields: [],
  sort: {
    fields: [
      { key: 'sort', label: 'Order on the till', column: 'sort' },
      { key: 'name', label: 'Name', column: 'name', collate: 'nocase' },
    ],
    default: 'sort',
  },
} as const satisfies ListSpec
