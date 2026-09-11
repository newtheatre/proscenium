import { MAX_BAR_NAME } from './bar'
import type { ListSpec } from './list-filters'

// The bar products' declaration (K-129, F-111). Category and retired are not columns the way a
// listed product's own name is; category resolves through the join and retired through status.
export const barProductsList = {
  key: 'bar-products',
  search: { placeholder: 'A product', maxLength: MAX_BAR_NAME },
  fields: [
    {
      key: 'categoryId',
      label: 'Category',
      kind: 'search-list',
      column: 'category_id',
      // The column is never null, so "is empty" would always answer nothing.
      operators: ['is', 'not', 'any'],
      icon: 'i-lucide-layout-grid',
    },
    { key: 'retired', label: 'Retired', kind: 'yes-no' },
  ],
  sort: {
    fields: [
      { key: 'category', label: 'Category', column: 'category_sort' },
      { key: 'categoryName', label: 'Category name', column: 'category_name', collate: 'nocase' },
      { key: 'sort', label: 'Order in the category', column: 'sort' },
      { key: 'name', label: 'Product', column: 'name', collate: 'nocase' },
    ],
    default: 'category',
  },
} as const satisfies ListSpec
