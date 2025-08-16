import type { ShowStatus, ShowType } from '@prisma/client'
import type {
  BaseEntityWithStatus,
  ApiResponse,
  ListResponse,
  FilterParams,
} from './base'

/**
 * Show domain types
 */

// ContentWarning model
export interface ContentWarning extends BaseEntityWithStatus {
  name: string
  description?: string | null
  icon?: string | null
  shows?: ShowContentWarning[]
}

// ShowContentWarning junction model
export interface ShowContentWarning {
  showId: string
  contentWarningId: string
  notes?: string | null
  createdAt: string
  show?: Show
  contentWarning?: ContentWarning
}

// ShowInduction model
export interface ShowInduction {
  id: string
  technicalRequirements?: string | null
  riskAssessmentCompleted: boolean
  riskAssessmentLink?: string | null
  companyContactName?: string | null
  companyContactEmail?: string | null
  companyContactPhone?: string | null
  inductionNotes?: string | null
  inductionCompleted: boolean
  showId: string
  createdAt: string
  updatedAt: string
  show?: Show
}

// Show model
export interface Show extends BaseEntityWithStatus {
  title: string
  slug: string
  description: string
  status: ShowStatus
  type: ShowType
  posterImageUrl?: string | null
  programmeUrl?: string | null // Missing from current types
  ageRating?: string | null
  // Relations
  induction?: ShowInduction | null
  performances?: Performance[]
  contentWarnings?: ShowContentWarning[]
  showTicketPrices?: ShowTicketPrice[]
}

// Input types for show operations
export interface ShowCreateInput {
  title: string
  slug: string
  description: string
  type: ShowType
  status?: ShowStatus
  posterImageUrl?: string | null
  programmeUrl?: string | null
  ageRating?: string | null
}

export interface ShowUpdateInput {
  title?: string
  slug?: string
  description?: string
  type?: ShowType
  status?: ShowStatus
  posterImageUrl?: string | null
  programmeUrl?: string | null
  ageRating?: string | null
  isActive?: boolean
}

// Input types for show induction
export interface ShowInductionCreateInput {
  technicalRequirements?: string | null
  riskAssessmentCompleted?: boolean
  riskAssessmentLink?: string | null
  companyContactName?: string | null
  companyContactEmail?: string | null
  companyContactPhone?: string | null
  inductionNotes?: string | null
  inductionCompleted?: boolean
}

export interface ShowInductionUpdateInput {
  technicalRequirements?: string | null
  riskAssessmentCompleted?: boolean
  riskAssessmentLink?: string | null
  companyContactName?: string | null
  companyContactEmail?: string | null
  companyContactPhone?: string | null
  inductionNotes?: string | null
  inductionCompleted?: boolean
}

// Input types for content warnings
export interface ContentWarningCreateInput {
  name: string
  description?: string | null
  icon?: string | null
}

export interface ContentWarningUpdateInput {
  name?: string
  description?: string | null
  icon?: string | null
  isActive?: boolean
}

// Simplified types for listings and relationships
export interface ShowSummary {
  id: string
  title: string
  slug: string
  posterImageUrl?: string | null
  ageRating?: string | null
  status: ShowStatus
  showType: ShowType
}

export interface ContentWarningSummary {
  id: string
  name: string
  icon?: string | null
}

// List item types for admin views
export interface ShowListItem {
  id: string
  title: string
  slug: string
  status: ShowStatus
  showType: ShowType
  posterImageUrl?: string | null
  ageRating?: string | null
  isActive: boolean
  performanceCount: number
  createdAt: string
}

export interface ContentWarningListItem {
  id: string
  name: string
  description?: string | null
  icon?: string | null
  isActive: boolean
  showCount: number
  createdAt: string
}

// Search and filter types
export interface ShowFilterParams extends FilterParams {
  status?: ShowStatus[]
  type?: ShowType[]
  isActive?: boolean
  hasPerformances?: boolean
}

// API response types
export type ShowResponse = ApiResponse<{ show: Show }>
export type ShowsResponse = ApiResponse<{ shows: ShowListItem[] }>
export type ShowListResponse = ApiResponse<ListResponse<ShowListItem>>
export type ContentWarningResponse = ApiResponse<{ contentWarning: ContentWarning }>
export type ContentWarningsResponse = ApiResponse<{ contentWarnings: ContentWarningListItem[] }>
export type ContentWarningListResponse = ApiResponse<ListResponse<ContentWarningListItem>>
export type ShowInductionResponse = ApiResponse<{ induction: ShowInduction }>

// Show statistics
export interface ShowStats {
  totalShows: number
  statusBreakdown: Record<ShowStatus, number>
  typeBreakdown: Record<ShowType, number>
  activeShows: number
  showsWithInduction: number
  averageContentWarnings: number
}
