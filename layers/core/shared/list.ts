// A list's state lives in its address: search, filters, sort and page, so a filtered list is a link
// that can be shared and Back returns to it. Pure functions, also used by the export.

export interface ListState {
  search: string
  filters: Record<string, string>
  sort?: string
  order: 'asc' | 'desc'
  page: number
  pageSize: number
}

export const DEFAULT_PAGE_SIZE = 25 // not-policy: the specification's page size
const RESERVED = new Set(['q', 'sort', 'order', 'page', 'size'])

type Query = Record<string, string | string[] | null | undefined>

const one = (value: Query[string]): string | undefined => (Array.isArray(value) ? value[0] : value) ?? undefined

export function parseList(query: Query, filterNames: readonly string[], defaults: Partial<Pick<ListState, 'sort' | 'order' | 'pageSize'>> = {}): ListState {
  const filters: Record<string, string> = {}
  for (const name of filterNames) {
    const value = one(query[name])
    if (value) filters[name] = value
  }
  const page = Number.parseInt(one(query.page) ?? '1', 10)
  const size = Number.parseInt(one(query.size) ?? '', 10)
  return {
    search: one(query.q) ?? '',
    filters,
    sort: one(query.sort) ?? defaults.sort,
    order: one(query.order) === 'desc' ? 'desc' : one(query.order) === 'asc' ? 'asc' : defaults.order ?? 'asc',
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(size) && size > 0 ? size : defaults.pageSize ?? DEFAULT_PAGE_SIZE,
  }
}

/** The address query for a state, leaving out whatever is the default so links stay short. */
export function serialiseList(state: ListState, defaults: Partial<Pick<ListState, 'sort' | 'order' | 'pageSize'>> = {}): Record<string, string> {
  const out: Record<string, string> = {}
  if (state.search) out.q = state.search
  for (const [name, value] of Object.entries(state.filters)) if (value && !RESERVED.has(name)) out[name] = value
  if (state.sort && state.sort !== defaults.sort) out.sort = state.sort
  if (state.sort && state.order !== (defaults.order ?? 'asc')) out.order = state.order
  if (state.page > 1) out.page = String(state.page)
  if (state.pageSize !== (defaults.pageSize ?? DEFAULT_PAGE_SIZE)) out.size = String(state.pageSize)
  return out
}

export function activeFilterCount(state: ListState): number {
  return Object.keys(state.filters).length + (state.search ? 1 : 0)
}

export interface ListResult<Row> {
  rows: Row[]
  /** All rows that match, not just this page. */
  total: number
}

/** CSV with the quoting spreadsheets expect, and a guard against formulas in a cell. */
export function toCsv(rows: readonly Record<string, unknown>[], columns: readonly { key: string, label: string }[]): string {
  const cell = (value: unknown): string => {
    let text = value === null || value === undefined ? '' : String(value)
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const lines = [columns.map(c => cell(c.label)).join(',')]
  for (const row of rows) lines.push(columns.map(c => cell(row[c.key])).join(','))
  return `${lines.join('\r\n')}\r\n`
}
