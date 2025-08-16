/**
 * Base utility types and common patterns for reusability
 */

// Base entity interface with common fields
export interface BaseEntity {
  id: string
  createdAt: string
  updatedAt: string
}

// Base entity with soft delete capability
export interface BaseEntityWithStatus extends BaseEntity {
  isActive: boolean
}

// Generic timestamp fields
export interface Timestamps {
  createdAt: string
  updatedAt: string
}

// Optional timestamp fields for input types
export interface OptionalTimestamps {
  createdAt?: string
  updatedAt?: string
}

// Pagination parameters for requests
export interface PaginationParams {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

// Pagination response data
export interface PaginationInfo {
  page: number
  total: number
  pages: number
  limit: number
}

// Generic CRUD operation types
export interface CreateInput<T> {
  data: T
}

export interface UpdateInput<T> {
  id: string
  data: Partial<T>
}

export interface DeleteInput {
  id: string
}

export interface BulkDeleteInput {
  ids: string[]
}

// Search and filter types
export interface SearchParams {
  q?: string
  filters?: Record<string, unknown>
}

export interface FilterParams extends PaginationParams, SearchParams {}

// Generic status management
export interface StatusUpdate {
  isActive: boolean
}

export interface BulkStatusUpdate extends StatusUpdate {
  ids: string[]
}

// Common validation patterns
export interface ValidationError {
  field: string
  message: string
  code: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

// File upload types TODO: implement File uploads!!
export interface FileUpload {
  filename: string
  mimetype: string
  size: number
  url: string
}

export interface ImageUpload extends FileUpload {
  width?: number
  height?: number
  alt?: string
}

// Generic relationship types
export interface HasOne<T> {
  relation: T | null
}

export interface HasMany<T> {
  relations: T[]
}

export interface BelongsTo<T> {
  parent: T
}

// Utility types for making fields optional/required
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
export type MakeRequired<T, K extends keyof T> = T & Required<Pick<T, K>>

// Utility type for creating input types from entities
export type CreateInputFromEntity<T extends BaseEntity> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateInputFromEntity<T extends BaseEntity> = Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>

// Database transaction types
export interface TransactionContext {
  transactionId: string
  startTime: Date
}

// Utility type for nested partial updates
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

// Type for extracting array element types
export type ArrayElement<T extends readonly unknown[]> = T extends readonly (infer E)[] ? E : never

// Generic ID types
export type EntityId = string
export type EntityIds = EntityId[]

// Common date/time utilities
export interface DateRange {
  startDate: string
  endDate: string
}

export interface TimeSlot {
  startTime: string
  endTime: string
}

export interface DateTimeRange extends DateRange {
  startTime?: string
  endTime?: string
}
