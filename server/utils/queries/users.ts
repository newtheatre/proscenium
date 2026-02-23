import type { db } from '@nuxthub/db'

type UserQuery = NonNullable<Parameters<(typeof db)['query']['users']['findMany']>[0]>

/**
 * Map a raw user row (with nested `userRoles` relation) to the API response shape.
 * Flattens `userRoles` into a `roles` string array and strips `userRoles`.
 */
export function formatUserResponse(
  user: { userRoles: Array<{ role: string }>, [key: string]: unknown },
) {
  const { userRoles, ...rest } = user
  return {
    ...rest,
    roles: userRoles.map(r => r.role),
  }
}

/**
 * Shared Drizzle query options for loading a user with roles (excluding password).
 */
export const userWithRolesQuery = {
  columns: { password: false },
  with: { userRoles: { columns: { role: true } } },
} satisfies UserQuery
