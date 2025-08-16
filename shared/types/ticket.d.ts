import type {
  BaseEntityWithStatus,
  ApiResponse,
  ListResponse,
} from './base'

/**
 * Ticket domain types
 */

// TicketType model
export interface TicketType extends BaseEntityWithStatus {
  name: string
  description?: string | null
  defaultPrice: number // Float in Prisma
  sortOrder?: number | null
  // Relations
  showPrices?: ShowTicketPrice[]
  performancePrices?: PerformanceTicketPrice[]
  reservedTickets?: ReservedTicket[]
}

// ShowTicketPrice model
export interface ShowTicketPrice extends BaseEntityWithStatus {
  price: number // Float in Prisma
  notes?: string | null
  showId: string
  ticketTypeId: string
  // Relations
  show?: Show
  ticketType?: TicketType
  reservedTickets?: ReservedTicket[]
}

// PerformanceTicketPrice model
export interface PerformanceTicketPrice extends BaseEntityWithStatus {
  price: number // Float in Prisma
  notes?: string | null
  performanceId: string
  ticketTypeId: string
  // Relations
  performance?: Performance
  ticketType?: TicketType
  reservedTickets?: ReservedTicket[]
}

// ReservedTicket model (part of reservation system)
export interface ReservedTicket {
  id: string
  quantity: number
  pricePerItemAtReservation: number // Float in Prisma
  ticketTypeNameAtReservation: string
  createdAt: string
  updatedAt: string
  reservationId: string
  ticketTypeId: string
  // Optional price rule links
  performanceTicketPriceId?: string | null
  showTicketPriceId?: string | null
  // Relations
  reservation?: Reservation
  ticketType?: TicketType
  performanceTicketPrice?: PerformanceTicketPrice | null
  showTicketPrice?: ShowTicketPrice | null
}

// Input types for ticket operations
export interface TicketTypeCreateInput {
  name: string
  description?: string | null
  defaultPrice: number
  sortOrder?: number | null
}

export interface TicketTypeUpdateInput {
  name?: string
  description?: string | null
  defaultPrice?: number
  sortOrder?: number | null
  isActive?: boolean
}

export interface ShowTicketPriceInput {
  ticketTypeId: string
  price: number
  notes?: string | null
}

export interface PerformanceTicketPriceInput {
  ticketTypeId: string
  price: number
  notes?: string | null
}

// Simplified types for listings
export interface TicketTypeSummary {
  id: string
  name: string
  defaultPrice: number
}

export interface TicketTypeListItem {
  id: string
  name: string
  description?: string | null
  defaultPrice: number
  sortOrder?: number | null
  isActive: boolean
  showCount: number
  performanceCount: number
  createdAt: string
}

// API response types
export type TicketTypeResponse = ApiResponse<{ ticketType: TicketType }>
export type TicketTypesResponse = ApiResponse<{ ticketTypes: TicketTypeListItem[] }>
export type TicketTypeListResponse = ApiResponse<ListResponse<TicketTypeListItem>>

export interface ShowTicketPrice {
  id: string
  price: number
  notes?: string | null
  showId: string
  ticketTypeId: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  show?: ShowSummary
  ticketType?: TicketType
}

export interface PerformanceTicketPrice {
  id: string
  price: number
  notes?: string | null
  performanceId: string
  ticketTypeId: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  performance?: PerformanceSummary
  ticketType?: TicketType
}

/**
 * Pricing logic types
 */
export interface PricingContext {
  ticketTypeId: string
  showId?: string
  performanceId?: string
  quantity: number
}

export interface PricingResult {
  pricePerItem: number
  totalPrice: number
  priceSource: 'performance' | 'show' | 'default'
  appliedRule?: ShowTicketPrice | PerformanceTicketPrice
}

/**
 * Request/Response types
 */
export interface TicketTypeCreateInput {
  name: string
  description?: string
  defaultPrice: number
  sortOrder?: number
  isActive?: boolean
}

export interface TicketTypeUpdateInput {
  name?: string
  description?: string
  defaultPrice?: number
  sortOrder?: number
  isActive?: boolean
}

export interface ShowTicketPriceInput {
  ticketTypeId: string
  price: number
  notes?: string
}

export interface PerformanceTicketPriceInput {
  ticketTypeId: string
  price: number
  notes?: string
}

export interface TicketAvailabilityResponse {
  performanceId: string
  lastUpdated: string
  totalCapacity: number
  totalAvailable: number
  totalReserved: number
  ticketTypes: {
    id: string
    name: string
    description?: string | null
    currentPrice: number
    isActive: boolean
    availability: {
      available: number
      reserved: number
      collected: number
    }
  }[]
}

// Forward declarations to avoid circular dependencies
interface ShowSummary {
  id: string
  title: string
  slug: string
}

interface PerformanceSummary {
  id: string
  title: string
  startDateTime: string
}
