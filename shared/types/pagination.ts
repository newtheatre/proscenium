/**
 * The envelope every paginated list endpoint returns.
 *
 * Declared in `shared/` because both sides need it: the handler builds it (see
 * `server/utils/pagination.ts`, which re-exports this) and the page consuming it
 * has to describe what it is fetching. It used to be declared server-side only,
 * so `app/pages/admin/users.vue` hand-wrote its own copy — the start of exactly
 * the drift that docs/09-known-issues.md #16 is about.
 */
export interface Paginated<T> {
  rows: T[]
  total: number
  page: number
  limit: number
  /**
   * Rows matching the filter but withheld from `rows` — currently only
   * `/api/users`, which counts anonymised accounts without listing them.
   */
  hiddenAnonymised?: number
}
