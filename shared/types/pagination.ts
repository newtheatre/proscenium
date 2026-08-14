/**
 * The envelope every paginated list endpoint returns (ADR-0005).
 *
 * In `shared/` because both sides need it: the handler builds it and the page
 * consuming it has to describe what it is fetching.
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
