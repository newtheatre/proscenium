import type {
  ShowStatus,
  PerformanceBookingStatus,
  ReservationStatus,
  RoleType,
  MembershipType,
} from '@prisma/client'

/**
 * Admin-specific types and utilities
 */

export interface AdminDashboardStats {
  totalShows: number
  totalPerformances: number
  totalReservations: number
  totalRevenue: number
  activeUsers: number
  showStatusCounts: Record<ShowStatus, number>
  performanceStatusCounts: Record<PerformanceBookingStatus, number>
  reservationStatusCounts: Record<ReservationStatus, number>
}

export interface AdminShowListItem extends Show {
  performanceCount: number
  totalReservations: number
  totalRevenue: number
  nextPerformance?: {
    id: string
    startDateTime: string
  }
}

export interface AdminPerformanceListItem extends Performance {
  show?: {
    id: string
    title: string
    slug: string
    status: ShowStatus
  }
  venue?: {
    id: string
    name: string
    capacity: number
  }
  stats?: {
    totalReservations: number
    pendingCollections: number
    totalRevenue: number
    capacityUtilization: number
  }
}

export interface AdminUserListItem {
  id: string
  email: string
  emailVerified: boolean
  setupCompleted: boolean
  isActive: boolean
  roles: RoleType[]
  createdAt: string
  lastLogin?: string | null
  profile?: {
    name: string
    avatar?: string | null
  }
  membership?: {
    type: MembershipType
    expiry?: string | null
  }
  reservationCount: number
}

export interface AdminReservationListItem extends Reservation {
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
  user?: {
    id: string
    email: string
    profile?: {
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

// These aren't needed yet but could be useful in future once we've got a usable website
export interface BulkOperationRequest {
  itemIds: string[]
  action: string
  params?: Record<string, unknown>
}

export interface BulkOperationResult {
  successCount: number
  errorCount: number
  errors: {
    itemId: string
    error: string
  }[]
}

export interface AdminAuditLogEntry {
  id: string
  userId: string
  action: string
  resourceType: string
  resourceId: string
  changes?: Record<string, {
    from: unknown
    to: unknown
  }>
  timestamp: string
  ipAddress?: string
  userAgent?: string
}
