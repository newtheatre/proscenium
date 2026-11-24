// Borrow kit's basket (S12, S13): the dates and what is chosen, kept while the member moves between
// the catalogue and the request. A mixed basket becomes one request per department (L2).
import type { CatalogueItem } from '../../shared/borrowing'

export interface BasketLine { item: CatalogueItem, quantity: number }

export function useKitBasket() {
  const dates = useState('inventory:basket:dates', () => ({ start: '', end: '' }))
  const lines = useState<BasketLine[]>('inventory:basket:lines', () => [])
  const has = (id: string) => lines.value.some(l => l.item.id === id)
  const add = (item: CatalogueItem) => { if (!has(item.id)) lines.value = [...lines.value, { item, quantity: 1 }] }
  const remove = (id: string) => { lines.value = lines.value.filter(l => l.item.id !== id) }
  const clear = () => { lines.value = [] }
  const departments = computed(() => [...new Set(lines.value.map(l => l.item.department))])
  return { dates, lines, has, add, remove, clear, departments }
}
