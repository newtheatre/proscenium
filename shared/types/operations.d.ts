import type {
  ApiResponse,
  ListResponse,
  ValidationError,
} from './base'

/**
 * Common CRUD operation patterns for reusability across domains
 */

// Generic CRUD response types
export interface CreateResponse<T> extends ApiResponse<{ item: T }> {
  success: true
  data: { item: T }
}

export interface UpdateResponse<T> extends ApiResponse<{ item: T }> {
  success: true
  data: { item: T }
}

export interface DeleteResponse extends ApiResponse<{ deleted: true }> {
  success: true
  data: { deleted: true }
}

export interface GetResponse<T> extends ApiResponse<{ item: T }> {
  success: true
  data: { item: T }
}

export interface ListApiResponse<T> extends ApiResponse<ListResponse<T>> {
  success: true
  data: ListResponse<T>
}

// Generic input validation types
export interface ValidatedInput<T> {
  data: T
  errors: ValidationError[]
  isValid: boolean
}

// Generic repository operation types
export interface RepositoryCreateOptions<T> {
  data: T
  include?: string[]
  select?: (keyof T)[]
}

export interface RepositoryUpdateOptions<T> {
  where: { id: string }
  data: Partial<T>
  include?: string[]
  select?: (keyof T)[]
}

export interface RepositoryFindOptions<T> {
  where?: Record<string, unknown>
  include?: string[]
  select?: (keyof T)[]
  orderBy?: Record<string, 'asc' | 'desc'>[]
  take?: number
  skip?: number
}

// Generic service operation results
export interface ServiceResult<T> {
  success: boolean
  data?: T
  error?: string
  validationErrors?: ValidationError[]
}

export type CreateResult<T> = ServiceResult<T>
export type UpdateResult<T> = ServiceResult<T>
export type DeleteResult = ServiceResult<{ deleted: boolean }>
export type GetResult<T> = ServiceResult<T>
export type ListResult<T> = ServiceResult<ListResponse<T>>

// Generic batch operation types
export interface BatchCreateInput<T> {
  items: T[]
  skipInvalid?: boolean
}

export interface BatchUpdateInput<T> {
  updates: Array<{
    id: string
    data: Partial<T>
  }>
  skipInvalid?: boolean
}

export interface BatchDeleteInput {
  ids: string[]
  skipInvalid?: boolean
}

export interface BatchOperationResult<T> {
  successful: T[]
  failed: Array<{
    item: T | string
    error: string
    validationErrors?: ValidationError[]
  }>
  summary: {
    total: number
    successful: number
    failed: number
  }
}

// Generic audit operation types NOTE: Not used but I think they could be useful
export interface AuditableOperation {
  userId?: string
  userRole?: string
  ipAddress?: string
  userAgent?: string
  reason?: string
}

export interface CreateWithAudit<T> extends AuditableOperation {
  data: T
}

export interface UpdateWithAudit<T> extends AuditableOperation {
  id: string
  data: Partial<T>
}

export interface DeleteWithAudit extends AuditableOperation {
  id: string
}

// Generic permission check types
export interface PermissionCheck {
  userId: string
  resource: string
  action: 'create' | 'read' | 'update' | 'delete'
  resourceId?: string
}

export interface PermissionResult {
  allowed: boolean
  reason?: string
  requiredRoles?: string[]
}

// Generic export/import types TODO: add bulk action API routes
export interface ExportOptions {
  format: 'json' | 'csv' | 'xlsx'
  fields?: string[]
  filters?: Record<string, unknown>
  filename?: string
}

export interface ImportOptions {
  format: 'json' | 'csv' | 'xlsx'
  mapping?: Record<string, string>
  skipInvalid?: boolean
  updateExisting?: boolean
}

export interface ImportResult<T> {
  imported: T[]
  skipped: Array<{
    row: number
    data: Record<string, unknown>
    errors: ValidationError[]
  }>
  updated: T[]
  summary: {
    totalRows: number
    imported: number
    skipped: number
    updated: number
  }
}
