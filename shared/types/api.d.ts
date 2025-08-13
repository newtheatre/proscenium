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
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  pagination?: {
    page: number
    total: number
    pages: number
    limit: number
  }
}

export type UserResponse = ApiResponse<{ user: UserWithRelations }>

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
