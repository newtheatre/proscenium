import type { ReservationStatus } from '@prisma/client'
import type {
  CustomerSummary,
  ReservationSummary,
  ReservationCreateInput,
} from './reservation'

/**
 * Front of House (FOH) specific types
 */

export interface FOHDashboardData {
  todaysPerformances: PerformanceWithReservationSummary[]
  totalReservations: number
  pendingCollections: number
  totalRevenue: number
  recentActivity: RecentActivity[]
}

export interface PerformanceWithReservationSummary {
  id: string
  title: string
  startDateTime: string
  endDateTime: string
  show?: {
    id: string
    title: string
    posterImageUrl?: string | null
    ageRating?: string | null
  }
  venue?: {
    id: string
    name: string
    capacity: number
  }
  reservationSummary: {
    totalReservations: number
    pendingCollection: number
    collected: number
    cancelled: number
    totalRevenue: number
    expectedRevenue: number
  }
}

export interface RecentActivity {
  id: string
  type: 'reservation_created' | 'tickets_collected' | 'reservation_cancelled'
  timestamp: string
  details: string
  reservationCode?: string
  performanceTitle?: string
}

export interface FOHCustomer extends CustomerSummary {
  recentReservations?: ReservationSummary[]
}

export interface FOHReservationListItem {
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
    show: {
      title: string
      slug: string
    }
    venue: {
      name: string
    }
  }
  reservedTickets: {
    id: string
    quantity: number
    ticketTypeNameAtReservation: string
    pricePerItemAtReservation: number
  }[]
}

export interface FOHReservationCreate extends ReservationCreateInput {
  adminNotes?: string
  collectionDeadline?: string
  status?: ReservationStatus
}

export interface ReservationCollectionRequest {
  reservationId: string
  collectedBy: string // Staff member name/ID
  paymentMethod?: 'cash' | 'card' | 'online' | 'complimentary'
  notes?: string
}

export interface FOHValidationResult {
  valid: boolean
  reservation?: FOHReservationListItem
  issues?: string[]
  canCollect: boolean
  warnings?: string[]
}
