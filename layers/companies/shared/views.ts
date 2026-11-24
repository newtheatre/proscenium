// What the console's Companies list and a company's record page are sent (part 5), shared by the server and the screens.
import type { EngagementKind, EngagementState, Receives } from './companies'

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
  canManageContacts: boolean
  contacts: ContactRow[]
  engagements: EngagementRow[]
}
