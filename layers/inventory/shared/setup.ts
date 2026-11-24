// What setting up Inventory starts from (spec part 6, "Starting lists"), shared by the server and
// the set-up screens, which show a list before it is made. Categories and tags start empty.
import type { CERTIFICATE, LendsTo } from './states'

export interface StartingDepartment { name: string, tagPrefix: string, lendsTo: LendsTo }

export const STARTING_DEPARTMENTS: readonly StartingDepartment[] = [
  { name: 'Props', tagPrefix: 'PRP', lendsTo: 'members' },
  { name: 'Costume', tagPrefix: 'CST', lendsTo: 'members' },
  { name: 'Set', tagPrefix: 'SET', lendsTo: 'productions' },
  { name: 'Technical', tagPrefix: 'TEC', lendsTo: 'productions' },
]

export interface StartingKind { name: string, intervalDays: number, certificate: 'none' | 'optional' | 'required', contractorAllowed: boolean, blocksWhenOverdue: boolean }

// The values proposed in spec part 6; each is the theatre's to change once made.
export const STARTING_KINDS: readonly StartingKind[] = [
  { name: 'PAT test', intervalDays: 365, certificate: 'optional', contractorAllowed: true, blocksWhenOverdue: true }, // not-policy: a starting row the theatre edits
  { name: 'Visual check', intervalDays: 91, certificate: 'none', contractorAllowed: false, blocksWhenOverdue: true }, // not-policy: a starting row the theatre edits
  { name: 'Lifting equipment examination', intervalDays: 182, certificate: 'required', contractorAllowed: true, blocksWhenOverdue: true }, // not-policy: a starting row the theatre edits
  { name: 'Flame-retardancy check', intervalDays: 365, certificate: 'optional', contractorAllowed: false, blocksWhenOverdue: true }, // not-policy: a starting row the theatre edits
]

// A location tree is at most this deep (spec part 2, inventory_locations.parent_id).
export const LOCATION_DEPTH = 4 // not-policy: the data model's shape

// What the set-up routes answer, one row of each list.
export interface Department {
  id: string
  name: string
  tagPrefix: string
  nextTagNumber: number
  lendsTo: LendsTo
  guidance: string | null
  contact: string | null
  requirements: string[]
  state: 'active' | 'archived'
  categories: number
}

export interface Category {
  id: string
  departmentId: string
  name: string
  requirements: string[]
  kindIds: string[]
  state: 'active' | 'archived'
  items: number
}

export interface Kind {
  id: string
  name: string
  description: string | null
  intervalDays: number
  certificate: typeof CERTIFICATE[number]
  contractorAllowed: boolean
  blocksWhenOverdue: boolean
  inspectorRequirements: string[]
  state: 'active' | 'archived'
  categories: number
}

export interface Location {
  id: string
  name: string
  parentId: string | null
  venueId: string | null
  spaceId: string | null
  state: 'active' | 'archived'
  items: number
  children: number
}
