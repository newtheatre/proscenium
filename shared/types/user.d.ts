import type { MembershipType, RoleType } from '@prisma/client'
import type {
  BaseEntity,
  ApiResponse,
  ListResponse,
  FilterParams,
} from './base'

/**
 * User domain types matching Prisma schema exactly
 */

// UserRole junction table
export interface UserRole {
  id: string
  userId: string
  role: RoleType
}

// Core user entity
export interface User extends BaseEntity {
  email: string
  studentId?: string | null
  password: string
  // Email verification
  emailVerified: boolean
  emailVerificationToken?: string | null
  emailVerificationExpires?: string | null // DateTime as ISO string
  // Password reset
  passwordResetToken?: string | null
  passwordResetExpires?: string | null // DateTime as ISO string
  // Account setup tracking
  setupCompleted: boolean
  setupCompletedAt?: string | null // DateTime as ISO string
  isActive: boolean
  lastLogin?: string | null // DateTime as ISO string
  // Relations
  roles?: UserRole[]
  membership?: Membership | null
  profile?: Profile | null
  reservations?: Reservation[]
}

// Profile model
export interface Profile {
  id: string
  name: string
  bio?: string | null
  avatar?: string | null
  gradYear?: number | null
  course?: string | null
  socialLinks?: SocialLinks | null
  userId: string
}

// SocialLinks model
export interface SocialLinks {
  id: string
  github?: string | null
  linkedin?: string | null
  facebook?: string | null
  discord?: string | null
  instagram?: string | null
  profileId?: string | null
}

// Membership model
export interface Membership {
  id: string
  type: MembershipType
  expiry?: string | null // DateTime as ISO string
  userId: string
}

// User with related data (for API responses)
export interface UserWithRelations extends User {
  roles: UserRole[]
  membership?: Membership | null
  profile?: Profile | null
}

// Input types for user operations
export interface UserCreateInput {
  email: string
  studentId?: string | null
  password: string
  emailVerified?: boolean
  isActive?: boolean
}

export interface UserUpdateInput {
  email?: string
  studentId?: string | null
  password?: string
  emailVerified?: boolean
  setupCompleted?: boolean
  isActive?: boolean
}

// Profile input types
export interface ProfileCreateInput {
  name: string
  bio?: string | null
  avatar?: string | null
  gradYear?: number | null
  course?: string | null
}

export type ProfileUpdateInput = Partial<ProfileCreateInput>

// SocialLinks input types
export interface SocialLinksInput {
  github?: string | null
  linkedin?: string | null
  facebook?: string | null
  discord?: string | null
  instagram?: string | null
}

// Membership input types
export interface MembershipInput {
  type: MembershipType
  expiry?: string | null // DateTime as ISO string
}

// User list item for admin views (simplified)
export interface UserListItem {
  id: string
  email: string
  profile?: {
    name: string
    avatar?: string | null
  } | null
  roles: RoleType[]
  membership?: {
    type: MembershipType
    expiry?: string | null
  } | null
  isActive: boolean
  lastLogin?: string | null
  createdAt: string
}

// User search and filter types
export interface UserFilterParams extends FilterParams {
  roles?: RoleType[]
  membershipType?: MembershipType
  isActive?: boolean
  emailVerified?: boolean
  setupCompleted?: boolean
}

// API response types
export type UserResponse = ApiResponse<{ user: UserWithRelations }>
export type UsersResponse = ApiResponse<{ users: UserListItem[] }>
export type UserListResponse = ApiResponse<ListResponse<UserListItem>>
export type ProfileResponse = ApiResponse<{ profile: Profile }>

// User statistics for admin dashboard NOTE: Cool stats but not implemented yet
export interface UserStats {
  totalUsers: number
  activeUsers: number
  inactiveUsers: number
  unverifiedUsers: number
  incompleteSetups: number
  membershipBreakdown: Record<MembershipType, number>
  roleBreakdown: Record<RoleType, number>
  recentRegistrations: number // last 30 days
}
