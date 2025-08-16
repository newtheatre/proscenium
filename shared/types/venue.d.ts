import type {
  BaseEntityWithStatus,
  ApiResponse,
  ListResponse,
  FilterParams,
} from './base'

/**
 * Venue domain types
 */

// VenueFeature model
export interface VenueFeature extends BaseEntityWithStatus {
  name: string
  description?: string | null
  icon?: string | null
  venues?: Venue[]
}

// Venue model
export interface Venue extends BaseEntityWithStatus {
  name: string
  address?: string | null
  capacity?: number | null // Note: Int? in Prisma = number | null
  imageUrl?: string | null
  notes?: string | null
  performances?: Performance[]
  features?: VenueFeature[]
}

// Venue with full relations
export interface VenueWithRelations extends Venue {
  features: VenueFeature[]
  performances: Performance[]
}

// Input types for venue operations
export interface VenueCreateInput {
  name: string
  address?: string | null
  capacity?: number | null
  imageUrl?: string | null
  notes?: string | null
  featureIds?: string[] // For connecting to existing features
}

export interface VenueUpdateInput {
  name?: string
  address?: string | null
  capacity?: number | null
  imageUrl?: string | null
  notes?: string | null
  isActive?: boolean
  featureIds?: string[] // For updating feature connections
}

// Input types for venue features
export interface VenueFeatureCreateInput {
  name: string
  description?: string | null
  icon?: string | null
}

export interface VenueFeatureUpdateInput {
  name?: string
  description?: string | null
  icon?: string | null
  isActive?: boolean
}

// Simplified types for listings and relationships
export interface VenueSummary {
  id: string
  name: string
  capacity?: number | null
  address?: string | null
}

export interface VenueFeatureSummary {
  id: string
  name: string
  icon?: string | null
}

// List item types for admin views
export interface VenueListItem {
  id: string
  name: string
  address?: string | null
  capacity?: number | null
  isActive: boolean
  featureCount: number
  performanceCount: number
  createdAt: string
}

export interface VenueFeatureListItem {
  id: string
  name: string
  description?: string | null
  icon?: string | null
  isActive: boolean
  venueCount: number
  createdAt: string
}

// Search and filter types
export interface VenueFilterParams extends FilterParams {
  isActive?: boolean
  hasFeatures?: string[]
  capacityMin?: number
  capacityMax?: number
  location?: string
}

// API response types
export type VenueResponse = ApiResponse<{ venue: VenueWithRelations }>
export type VenuesResponse = ApiResponse<{ venues: VenueListItem[] }>
export type VenueListResponse = ApiResponse<ListResponse<VenueListItem>>
export type VenueFeatureResponse = ApiResponse<{ feature: VenueFeature }>
export type VenueFeaturesResponse = ApiResponse<{ features: VenueFeatureListItem[] }>
export type VenueFeatureListResponse = ApiResponse<ListResponse<VenueFeatureListItem>>

// Venue statistics NOTE: Could be cool to implement as part of report generation?
export interface VenueStats {
  totalVenues: number
  activeVenues: number
  totalFeatures: number
  averageCapacity: number
  totalCapacity: number
  mostPopularFeatures: Array<{
    featureId: string
    featureName: string
    venueCount: number
  }>
}
