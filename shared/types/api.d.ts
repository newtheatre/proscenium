import type { MembershipType, RoleType } from '@prisma/client'

/**
 * Shared type definitions for API responses and data structures
 */

export interface User {
  id: string
  email: string
  studentId?: string | null
  emailVerified: boolean
  setupCompleted: boolean
  setupCompletedAt?: string | null
  isActive: boolean
  roles: RoleType[]
  createdAt: string
  updatedAt: string
  lastLogin?: string | null
}

export interface Profile {
  name: string
  bio?: string | null
  avatar?: string | null
  gradYear?: number | null
  course?: string | null
  socialLinks?: SocialLinks | null
}

export interface SocialLinks {
  github?: string | null
  linkedin?: string | null
  facebook?: string | null
  discord?: string | null
  instagram?: string | null
}

export interface Membership {
  type: MembershipType
  expiry?: string | null
}

export interface UserWithRelations extends User {
  profile?: Profile | null
  membership?: Membership | null
}

/**
 * API Response types
 */
export interface Pagination {
  page: number
  total: number
  pages: number
  limit: number
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  pagination?: Pagination
}

export type UserResponse = ApiResponse<{ user: UserWithRelations }>

/**
 * Venue types
 */
export interface VenueFeature {
  id: string
  name: string
  description?: string | null
  icon?: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  venues?: AssociatedVenue[]
}

export interface AssociatedVenue {
  id: string
  name: string
  address?: string | null
  capacity?: number | null
  isActive: boolean
}

export interface Venue {
  id: string
  name: string
  address?: string | null
  capacity?: number | null
  imageUrl?: string | null
  notes?: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  features?: VenueFeature[]
}

export interface VenueWithRelations extends Venue {
  features: VenueFeature[]
}

export type VenueResponse = ApiResponse<{ venue: VenueWithRelations }>
export type VenuesResponse = ApiResponse<{ venues: Venue[] }>
export type VenueFeatureResponse = ApiResponse<{ feature: VenueFeature }>
export type VenueFeaturesResponse = ApiResponse<{ features: VenueFeature[] }>

/**
 * Form data types
 */
export interface UserUpdateData {
  email?: string
  studentId?: string | null
  password?: string
  emailVerified?: boolean
  setupCompleted?: boolean
  isActive?: boolean
  roles?: RoleType[]
  membership?: {
    type: MembershipType
    expiry?: string | null
  }
  profile?: Partial<Profile>
}

export interface VenueCreatePayload {
  name: string
  address?: string
  capacity?: number
  imageUrl?: string
  notes?: string
  featureIds?: string[]
}

export interface VenueUpdatePayload {
  name?: string
  address?: string
  capacity?: number | null
  imageUrl?: string
  notes?: string
  isActive?: boolean
  featureIds?: string[]
}

export interface VenueFeatureCreatePayload {
  name: string
  description?: string
  icon?: string
}

export interface VenueFeatureUpdatePayload {
  name?: string
  description?: string
  icon?: string
  isActive?: boolean
}
