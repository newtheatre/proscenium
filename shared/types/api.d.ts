import type {
  ValidationError,
  HttpStatusCode,
} from './base'

/**
 * General API patterns and utilities
 */

// Generic API response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  errors?: string[]
  pagination?: PaginationInfo
}

// Success response shorthand
export type SuccessResponse<T> = ApiResponse<T> & { success: true, data: T }

// Error response shorthand
export type ErrorResponse = ApiResponse<never> & {
  success: false
  message: string
  errors?: string[]
}

// Generic list response
export interface ListResponse<T> {
  items: T[]
  pagination: PaginationInfo
}

// Common sort options
export type SortOrder = 'asc' | 'desc'
export type SortField<T> = keyof T | string

export interface SortOptions<T = Record<string, unknown>> {
  field: SortField<T>
  order: SortOrder
}

// Generic query builder types
export interface QueryOptions<T = Record<string, unknown>> {
  select?: (keyof T)[]
  include?: string[]
  where?: Record<string, unknown>
  orderBy?: SortOptions<T>[]
  take?: number
  skip?: number
}

// Common HTTP status codes for API responses
export enum HttpStatusCode {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  INTERNAL_SERVER_ERROR = 500,
}

// Generic error types
export interface ApiError {
  code: string
  message: string
  statusCode: HttpStatusCode
  details?: Record<string, unknown>
}

export interface FieldError {
  field: string
  value: unknown
  message: string
  code: string
}

// Common API error responses
export interface ApiErrorResponse {
  success: false
  message: string
  code?: string
  statusCode: HttpStatusCode
  errors?: ValidationError[]
  timestamp: string
}

// API health check response
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  version: string
  uptime: number
  database: {
    status: 'connected' | 'disconnected'
    responseTime: number
  }
  services: Record<string, {
    status: 'available' | 'unavailable'
    responseTime?: number
  }>
}
