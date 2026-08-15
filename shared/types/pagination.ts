/**
 * The envelope every paginated list endpoint returns (ADR-0005). In `shared/`
 * because the handler builds it and the page consuming it describes it.
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
