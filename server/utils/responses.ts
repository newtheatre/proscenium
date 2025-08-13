/**
 * Standardized API response utilities
 */

/**
 * Create a standardized success response
 */
export function successResponse<T>(data?: T, message?: string): ApiResponse<T> {
  return {
    success: true,
    ...(data !== undefined && { data }),
    ...(message && { message }),
  }
}

/**
 * Create a standardized paginated response
 */
export function paginatedResponse<T>(
  data: T[],
  pagination: {
    page: number
    total: number
    limit: number
  },
  message?: string,
): ApiResponse<T[]> {
  return {
    success: true,
    data,
    pagination: {
      ...pagination,
      pages: Math.ceil(pagination.total / pagination.limit),
    },
    ...(message && { message }),
  }
}

/**
 * Handle standardized error responses
 */
export function handleApiError(error: unknown, context = 'API operation'): never {
  // If it's already a createError response, just throw it
  if (error && typeof error === 'object' && 'statusCode' in error) {
    throw error
  }

  // Log the error for debugging
  console.error(`${context} error:`, error)

  // Return a generic server error
  throw createError({
    statusCode: 500,
    statusMessage: 'Internal server error',
  })
}

/**
 * Transform user roles from database format to simple array
 */
export function transformUserRoles<T extends Record<string, unknown>>(user: T & { roles?: Array<{ role: unknown }> }): T {
  if (!user || !user.roles) return user

  return {
    ...user,
    roles: user.roles.map(r => r.role),
  }
}

/**
 * Safe user data serialization (removes sensitive fields and transforms roles)
 */
export function safeUserData(user: Record<string, unknown> | null | undefined) {
  if (!user) return null

  const {
    password,
    emailVerificationToken,
    emailVerificationExpires,
    passwordResetToken,
    passwordResetExpires,
    ...safeUser
  } = user

  return transformUserRoles(safeUser)
}

/**
 * Clean user data serialisation (removes sensitive fields and metadata and transforms roles)
 */
export function cleanUserData(user: Record<string, unknown> | null | undefined) {
  if (!user) return null

  const {
    password,
    emailVerificationToken,
    emailVerificationExpires,
    passwordResetToken,
    passwordResetExpires,
    setupCompletedAt,
    createdAt,
    updatedAt,
    lastLogin,
    isActive,
    ...cleanUser
  } = user

  return transformUserRoles(cleanUser)
}

/**
 * Session user data serialization (minimal data for session storage)
 * Only stores essential identification data to minimize cookie size
 */
export function sessionUserData(user: Record<string, unknown> | null | undefined) {
  if (!user) return null

  const userProfile = user.profile as { name?: string, avatar?: string } | undefined

  // Only include essential fields for session identification
  const sessionData: Record<string, unknown> = {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    setupCompleted: user.setupCompleted,
    profile: {
      name: userProfile?.name
        ? userProfile.name
        : undefined,
      avatar: userProfile?.avatar
        ? userProfile.avatar
        : undefined,
    },
    roles: [],
  }

  // Transform roles if they exist
  if (user.roles && Array.isArray(user.roles)) {
    sessionData.roles = user.roles
    return transformUserRoles(sessionData)
  }

  return sessionData
}

/**
 * Restricted user data serialization for public APIs (removes sensitive fields and metadata and transforms roles)
 * Used for endpoints that should not expose any user data
 */
export function restrictedUserData(user: Record<string, unknown> | null | undefined) {
  if (!user) return null

  const {
    password,
    email,
    studentId,
    emailVerified,
    emailVerificationToken,
    emailVerificationExpires,
    passwordResetToken,
    passwordResetExpires,
    setupCompleted,
    setupCompletedAt,
    createdAt,
    updatedAt,
    lastLogin,
    isActive,
    membership,
    ...restrictedUser
  } = user

  return transformUserRoles(restrictedUser)
}
