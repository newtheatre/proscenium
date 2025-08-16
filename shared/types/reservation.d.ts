import type { ReservationStatus } from '@prisma/client'
import type {
  ApiResponse,
  ListResponse,
  FilterParams,
} from './base'

/**
 * Reservation domain types matching Prisma schema exactly
 */

// Reservation model
export interface Reservation {
  id: string
  reservationCode: string
  totalPrice: number // Float in Prisma
  reservationDateTime: string // DateTime as ISO string
  status: ReservationStatus
  notes?: string | null
  adminNotes?: string | null
  collectionDeadline?: string | null // DateTime as ISO string
  // Customer details (built into model)
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  createdAt: string
  updatedAt: string
  performanceId: string
  userId?: string | null
  // Relations
  performance?: Performance
  user?: User | null
  reservedTickets?: ReservedTicket[]
}

// Input types for reservation operations
export interface ReservationCreateInput {
  totalPrice: number
  notes?: string | null
  adminNotes?: string | null
  collectionDeadline?: string | null // DateTime as ISO string
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  performanceId: string
  userId?: string | null
  reservedTickets: Array<{
    ticketTypeId: string
    quantity: number
    pricePerItem: number
    ticketTypeName: string
    performanceTicketPriceId?: string | null
    showTicketPriceId?: string | null
  }>
}

export interface ReservationUpdateInput {
  status?: ReservationStatus
  notes?: string | null
  adminNotes?: string | null
  collectionDeadline?: string | null // DateTime as ISO string
  customerName?: string
  customerEmail?: string
  customerPhone?: string | null
}

// Reservation with full relations for detailed views
export interface ReservationWithRelations extends Reservation {
  performance: Performance
  user?: User | null
  reservedTickets: ReservedTicket[]
}

// Simplified types for listings and relationships
export interface ReservationSummary {
  id: string
  reservationCode: string
  totalPrice: number
  status: ReservationStatus
  customerName: string
  customerEmail: string
  reservationDateTime: string
  collectionDeadline?: string | null
}

export interface CustomerSummary {
  name: string
  email: string
  phone?: string | null
  totalReservations: number
  totalSpent: number
  lastReservation?: string | null
}

// List item types for admin views
export interface ReservationListItem {
  id: string
  reservationCode: string
  totalPrice: number
  status: ReservationStatus
  reservationDateTime: string
  collectionDeadline?: string | null
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  notes?: string | null
  adminNotes?: string | null
  performance: {
    id: string
    title: string
    startDateTime: string
    show?: {
      title: string
      slug: string
    }
    venue?: {
      name: string
    }
  }
  reservedTickets: Array<{
    id: string
    quantity: number
    ticketTypeNameAtReservation: string
    pricePerItemAtReservation: number
  }>
  createdAt: string
  updatedAt: string
}

// Search and filter types
export interface ReservationFilterParams extends FilterParams {
  status?: ReservationStatus[]
  performanceId?: string
  userId?: string
  customerEmail?: string
  customerName?: string
  startDate?: string // Date range filtering
  endDate?: string
  hasCollectionDeadline?: boolean
  overdue?: boolean
}

// API response types
export type ReservationResponse = ApiResponse<{ reservation: ReservationWithRelations }>
export type ReservationsResponse = ApiResponse<{ reservations: ReservationListItem[] }>
export type ReservationListResponse = ApiResponse<ListResponse<ReservationListItem>>

// Reservation statistics
export interface ReservationStats {
  totalReservations: number
  statusBreakdown: Record<ReservationStatus, number>
  totalRevenue: number
  averageReservationValue: number
  uniqueCustomers: number
  overdueReservations: number
  recentReservations: number // last 7 days
}
