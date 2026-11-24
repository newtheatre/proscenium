// What the catalogue routes answer (S1, S2), shared by the server and the screens.
import type { Condition, ItemState, OWNERSHIP, Tracking } from './states'

export interface ItemRow {
  id: string
  tag: string
  name: string
  tracking: Tracking
  quantity: number
  state: ItemState
  condition: Condition
  lendable: boolean
  categoryId: string
  category: string
  departmentId: string
  department: string
  homeLocationId: string
  locationId: string
  location: string
  away: boolean
  nextDueOn: string | null
  onLoan: boolean
}

export interface ItemDetail extends ItemRow {
  description: string | null
  make: string | null
  model: string | null
  acquiredOn: string | null
  homeLocation: string
  outOfServiceReason: string | null
  requirements: string[]
  container: { id: string, tag: string } | null
  ownership: typeof OWNERSHIP[number]
  ownerDueBackOn: string | null
  // I9: only for holders of inventory.item.edit or inventory.item.export.
  staff: { serialNumber: string | null, replacementValue: number | null, currency: string, ownerName: string | null } | null
  dues: { kindId: string, kind: string, applies: boolean, nextDueOn: string | null, blocks: boolean }[]
  tags: { id: string, label: string }[]
  contents: { id: string, tag: string, name: string }[]
  history: { id: string, kind: string, at: number, condition: string | null, from: string | null, to: string | null }[]
}

interface Named { id: string, name: string }
export interface Place extends Named { parentId: string | null }

// Today's operating day, and the last day on which an inspection counts as due soon.
interface DueWindow { today: string, dueBy: string }

export interface ItemsList extends DueWindow {
  items: ItemRow[]
  departments: Named[]
  // The departments this person may add items to and change items in.
  editable: string[]
  categories: (Named & { departmentId: string })[]
  locations: Place[]
}

export interface ItemPage extends DueWindow { item: ItemDetail, editable: boolean }

export interface ItemOptions {
  departments: Named[]
  categories: (Named & { departmentId: string, kinds: string[], requirements: string[] })[]
  locations: Place[]
  tags: { id: string, label: string }[]
}
