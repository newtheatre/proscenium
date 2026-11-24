// What the console's Companies list and a company's record page are sent (part 5), shared by the server and the screens.
import type { CallKind, EngagementKind, EngagementState, Receives } from './companies'

export interface CompanyRow {
  id: string
  name: string
  publicName: string | null
  archived: boolean
  live: number
  kinds: EngagementKind[]
  primaryContact: string | null
  lastDate: number | null
}

export interface ContactRow {
  id: string
  accountId: string
  name: string
  email: string | null
  role: string | null
  isPrimary: boolean
  receives: Receives[]
  dayPhone: string | null
  unclaimed: boolean
}

export interface EngagementRow { id: string, title: string, kind: EngagementKind, state: EngagementState, productionId: string | null, lastDate: number | null }

export interface CompanyDetail {
  id: string
  name: string
  publicName: string | null
  legalName: string | null
  registration: string | null
  taxNumber: string | null
  address: string | null
  postcode: string | null
  invoiceEmail: string | null
  website: string | null
  description: string | null
  notes: string | null
  individual: boolean
  archived: boolean
  createdAt: number
  canManage: boolean
  canOpenEngagement: boolean
  canManageContacts: boolean
  contacts: ContactRow[]
  engagements: EngagementRow[]
}

/** Something a contact owes on an engagement: guests to name (with how many and by when), an agreement to answer, a settlement to agree. */
export interface ToDo { kind: 'name-guests' | 'answer-agreement' | 'agree-settlement', count: number, due: number | null }

export interface MyEngagement {
  id: string
  title: string
  kind: EngagementKind
  state: EngagementState
  companyId: string
  company: string
  firstDate: number | null
  lastDate: number | null
  toDo: ToDo[]
}

export interface EngagementListRow {
  id: string
  title: string
  kind: EngagementKind
  state: EngagementState
  productionId: string | null
  companyId: string
  company: string
  firstDate: number | null
  lastDate: number | null
}

export interface EngagementDetail {
  id: string
  title: string
  kind: EngagementKind
  state: EngagementState
  cancelReason: string | null
  currency: string
  productionId: string | null
  production: string | null
  seasonId: string | null
  companyId: string
  company: string
  createdAt: number
  firstDate: number | null
  lastDate: number | null
  canManage: boolean
  history: { id: string, kind: string, fromState: EngagementState | null, toState: EngagementState | null, at: number, actor: string | null }[]
}

/** One version of an engagement's agreement as the screens show it; durations in seconds. */
export interface AgreementVersion {
  id: string
  version: number
  dealType: 'split' | 'guarantee' | 'guarantee-or-split' | 'hire' | 'none'
  companyShareBp: number | null
  shareBasis: 'net-of-fees' | 'gross' | null
  guaranteeMinor: number | null
  hireFeeMinor: number | null
  hireFeeBasis: 'flat' | 'per-performance' | 'per-hour' | null
  depositMinor: number
  guestPlaces: number
  guestNamesDue: number
  settleWithin: number
  clauses: string | null
  state: 'draft' | 'sent' | 'accepted' | 'declined' | 'superseded' | 'withdrawn'
  sentAt: number | null
  createdAt: number
  answer: 'accepted' | 'declined' | null
  answeredAt: number | null
  onPaper: boolean
  responder: string | null
}

/** One call on an engagement's schedule (D1); `space` is the space's name. */
export interface CallRow {
  id: string
  kind: CallKind
  spaceId: string | null
  space: string | null
  startsAt: number
  endsAt: number
  label: string | null
  notes: string | null
}

/** Someone from the company who will be in the building (D3). */
export interface PersonRow { id: string, name: string, role: string | null, under18: boolean }

/** An engagement's calls and people, with what the viewer may change. */
export interface Schedule {
  calls: CallRow[]
  people: PersonRow[]
  spaces: { value: string, label: string }[]
  canManageCalls: boolean
  canManagePeople: boolean
  started: boolean
}
