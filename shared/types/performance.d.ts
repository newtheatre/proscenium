import type {
  PerformanceType,
  PerformanceBookingStatus,
} from '@prisma/client'
import type {
  BaseEntityWithStatus,
  ApiResponse,
  ListResponse,
  FilterParams,
} from './base'

/**
 * Performance domain types
 */

// Performance model - matches Prisma exactly
export interface Performance extends BaseEntityWithStatus {
  title: string
  startDateTime: string // DateTime as ISO string
  endDateTime: string // DateTime as ISO string
  type: PerformanceType
  details?: string | null
  status: PerformanceBookingStatus
  maxCapacity: number // Note: specific capacity for this performance
  reservationsOpen: boolean
  reservationInstructions?: string | null
  externalBookingLink?: string | null
  showId?: string | null
  venueId?: string | null
  // Relations
  show?: Show | null
  venue?: Venue | null
  ticketPrices?: PerformanceTicketPrice[]
  reservations?: Reservation[]
}

// Input types for performance operations
export interface PerformanceCreateInput {
  title: string
  startDateTime: string // DateTime as ISO string
  endDateTime: string // DateTime as ISO string
  type: PerformanceType
  details?: string | null
  status?: PerformanceBookingStatus
  maxCapacity: number
  reservationsOpen?: boolean
  reservationInstructions?: string | null
  externalBookingLink?: string | null
  showId?: string | null
  venueId?: string | null
}

export interface PerformanceUpdateInput {
  title?: string
  startDateTime?: string // DateTime as ISO string
  endDateTime?: string // DateTime as ISO string
  type?: PerformanceType
  details?: string | null
  status?: PerformanceBookingStatus
  maxCapacity?: number
  reservationsOpen?: boolean
  reservationInstructions?: string | null
  externalBookingLink?: string | null
  showId?: string | null
  venueId?: string | null
  isActive?: boolean
}

// Simplified types for listings and relationships
export interface PerformanceSummary {
  id: string
  title: string
  startDateTime: string
  endDateTime: string
  type: PerformanceType
  status: PerformanceBookingStatus
  maxCapacity: number
}

// Performance with related data for detailed views
export interface PerformanceWithRelations extends Performance {
  show?: Show | null
  venue?: Venue | null
  ticketPrices: PerformanceTicketPrice[]
  reservationStats?: {
    totalReservations: number
    totalTicketsReserved: number
    capacityUtilization: number
    revenue: number
  }
}

// List item types for admin views
export interface PerformanceListItem {
  id: string
  title: string
  startDateTime: string
  endDateTime: string
  type: PerformanceType
  status: PerformanceBookingStatus
  maxCapacity: number
  reservationsOpen: boolean
  isActive: boolean
  show?: {
    id: string
    title: string
    slug: string
  } | null
  venue?: {
    id: string
    name: string
  } | null
  reservationCount: number
  ticketsReserved: number
  createdAt: string
}

// Search and filter types
export interface PerformanceFilterParams extends FilterParams {
  type?: PerformanceType[]
  status?: PerformanceBookingStatus[]
  showId?: string
  venueId?: string
  startDate?: string // Date range filtering
  endDate?: string
  reservationsOpen?: boolean
  isActive?: boolean
}

// API response types
export type PerformanceResponse = ApiResponse<{ performance: PerformanceWithRelations }>
export type PerformancesResponse = ApiResponse<{ performances: PerformanceListItem[] }>
export type PerformanceListResponse = ApiResponse<ListResponse<PerformanceListItem>>

// Performance statistics
export interface PerformanceStats {
  totalPerformances: number
  typeBreakdown: Record<PerformanceType, number>
  statusBreakdown: Record<PerformanceBookingStatus, number>
  averageCapacity: number
  totalCapacity: number
  averageUtilization: number
  upcomingPerformances: number
  pastPerformances: number
}
