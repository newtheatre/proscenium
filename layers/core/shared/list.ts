// A list's state lives in its address: search, filters, sort and page, so a filtered list is a link
// that can be shared and Back returns to it. Pure functions, also used by the export.

// ---- The declaration -------------------------------------------------------------------------
// One declaration for each list, in the module's shared/ folder. The page, the data route, the
// export and saved views all read it, so they cannot disagree. This file is its pure part (types,
// validation and the address codec); the server's reader (readList) adds the SQL.

export type FilterKind = 'choice' | 'choices' | 'grouped' | 'lookup' | 'dates' | 'yes-no'
export interface ListOption { value: string, label: string }
export interface FilterDef {
  kind: FilterKind
  label: string
  /** Absent for the viewer who lacks it: the filter is not offered and its key in the address is ignored. */
  ability?: string
  /** choice and choices. A page may supply them when they are the theatre's own (seasons). */
  options?: ListOption[]
  /** grouped: a whole group is `group`, one value is `group.value`. */
  groups?: { value: string, label: string, items: ListOption[] }[]
  /** lookup: the route that searches (`?q=`) and the route that turns ids into labels (`?ids=`). */
  lookup?: { search: string, resolve: string }
  /** dates: relative presets such as `7d` (last 7 days) or `next30d`, declared for each filter. */
  presets?: ListOption[]
}
export interface SortDef { label: string, type: 'text' | 'date' | 'number', /** The direction a first press gives. */ natural?: 'asc' | 'desc' }
export interface ColumnDef {
  label: string
  /** The declared sort its heading names. A column without one has a plain heading. */
  sort?: string
  /** Cannot be hidden. */
  always?: boolean
  /** Survives on a phone's card. */
  card?: boolean
  /** Starts off. */
  hidden?: boolean
}
export interface ViewDef { label: string, filters?: Record<string, string>, sort?: string, order?: 'asc' | 'desc', /** Sub-rows start open. */ open?: boolean }
export interface ListDeclaration {
  id: string
  filters: Record<string, FilterDef>
  sorts: Record<string, SortDef>
  columns: Record<string, ColumnDef>
  /** Further fields the search covers that are not columns. Search itself cannot be turned off. */
  search?: readonly string[]
  views?: Record<string, ViewDef>
  defaultView?: string
  defaultSort?: { key: string, order: 'asc' | 'desc' }
  subRows?: { max: number }
}

/** Keys the address keeps for itself. */
export const RESERVED_KEYS = ['q', 'sort', 'order', 'page', 'size', 'view'] as const
export const MOST_SUB_ROWS = 20 // not-policy: the specification's ceiling on children shown for each parent

export function defineList<const L extends Omit<ListDeclaration, 'id'>>(id: string, declaration: L): L & { id: string } {
  const list = { ...declaration, id } as L & { id: string }
  const fail = (what: string): never => { throw new Error(`List ${id}: ${what}`) }
  for (const key of Object.keys(list.filters)) if ((RESERVED_KEYS as readonly string[]).includes(key)) fail(`the filter "${key}" uses a reserved address key`)
  for (const [key, c] of Object.entries(list.columns)) if (c.sort && !(c.sort in list.sorts)) fail(`column "${key}" names the undeclared sort "${c.sort}"`)
  if (list.defaultSort && !(list.defaultSort.key in list.sorts)) fail(`the default sort "${list.defaultSort.key}" is not declared`)
  for (const [name, v] of Object.entries(list.views ?? {})) {
    if (v.sort && !(v.sort in list.sorts)) fail(`view "${name}" names the undeclared sort "${v.sort}"`)
    for (const f of Object.keys(v.filters ?? {})) if (!(f in list.filters)) fail(`view "${name}" names the undeclared filter "${f}"`)
  }
  if (list.defaultView && !list.views?.[list.defaultView]) fail(`the default view "${list.defaultView}" is not declared`)
  if (list.subRows && (list.subRows.max < 1 || list.subRows.max > MOST_SUB_ROWS)) fail(`sub-rows show between 1 and ${MOST_SUB_ROWS} children`)
  return list
}

// ---- The address -----------------------------------------------------------------------------

export interface ListState {
  search: string
  /** The address's own words for each filter that is on: `draft,published`, `7d`, `orders.refund`. */
  filters: Record<string, string>
  view?: string
  sort?: string
  order: 'asc' | 'desc'
  page: number
  pageSize: number
}

export const DEFAULT_PAGE_SIZE = 25 // not-policy: the specification's page size
export const PAGE_SIZES = [25, 50, 100] as const

type Query = Record<string, string | string[] | null | undefined>
type Defaults = Partial<Pick<ListState, 'view' | 'sort' | 'order' | 'pageSize'>>

const one = (value: Query[string]): string | undefined => (Array.isArray(value) ? value[0] : value) ?? undefined

/** The defaults a declaration implies for a view (the default view when none is named): its sort, or the list's own. */
export function listDefaults(list: Pick<ListDeclaration, 'defaultView' | 'defaultSort' | 'views' | 'sorts'>, viewName?: string): Defaults {
  const view = viewName ? list.views?.[viewName] : list.defaultView ? list.views?.[list.defaultView] : undefined
  const sort = view?.sort ? { key: view.sort, order: view.order ?? list.sorts?.[view.sort]?.natural } : list.defaultSort
  return { view: list.defaultView, sort: sort?.key, order: sort?.order ?? 'asc' }
}

export function parseList(query: Query, list: Pick<ListDeclaration, 'filters' | 'defaultView' | 'defaultSort' | 'views' | 'sorts'>): ListState {
  const named = one(query.view)
  const defaults = listDefaults(list, named && list.views?.[named] ? named : undefined)
  const filters: Record<string, string> = {}
  for (const name of Object.keys(list.filters)) {
    const value = one(query[name])
    if (value) filters[name] = value
  }
  const page = Number.parseInt(one(query.page) ?? '1', 10)
  const size = Number.parseInt(one(query.size) ?? '', 10)
  const view = one(query.view)
  const sort = one(query.sort)
  return {
    search: one(query.q) ?? '',
    filters,
    view: view && list.views?.[view] ? view : defaults.view,
    sort: sort && sort in list.sorts ? sort : defaults.sort,
    order: one(query.order) === 'desc' ? 'desc' : one(query.order) === 'asc' ? 'asc' : defaults.order ?? 'asc',
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE,
  }
}

/** The address query for a state, leaving out whatever is the default so links stay short. */
export function serialiseList(state: ListState, list: Pick<ListDeclaration, 'defaultView' | 'defaultSort' | 'views' | 'sorts'>): Record<string, string> {
  const defaults = listDefaults(list, state.view)
  const out: Record<string, string> = {}
  if (state.search) out.q = state.search
  if (state.view && state.view !== listDefaults(list).view) out.view = state.view
  for (const [name, value] of Object.entries(state.filters)) if (value && !(RESERVED_KEYS as readonly string[]).includes(name)) out[name] = value
  if (state.sort && state.sort !== defaults.sort) out.sort = state.sort
  if (state.sort && state.order !== (defaults.order ?? 'asc')) out.order = state.order
  if (state.page > 1) out.page = String(state.page)
  if (state.pageSize !== DEFAULT_PAGE_SIZE) out.size = String(state.pageSize)
  return out
}

// ---- The strict reading, for the server -------------------------------------------------------
/** What a filter's address words mean, once validated. */
export interface DatesValue { from?: string, to?: string }
export type FilterValue = string | string[] | boolean | DatesValue | { group: string, item?: string }

export interface ListQuery<L extends Pick<ListDeclaration, 'filters'> = Pick<ListDeclaration, 'filters'>> {
  /** The search words, folded (no case, no accents). Every word must match. */
  words: string[]
  filters: { [K in keyof L['filters']]?: FilterValue }
  /** Filters named in the address that the viewer may not use. They are left out, not refused. */
  dropped: string[]
  view: string | null
  sort: { key: string, order: 'asc' | 'desc' }
  page: number
  size: number
}
/** The refusal for a key that is not the list's to take; the server answers it as core.list.unknown, naming the key. */
export interface ListRefusal { ok: false, key: string, reason: string }
export type ListDecoding<L extends Pick<ListDeclaration, 'filters'> = Pick<ListDeclaration, 'filters'>> = { ok: true, value: ListQuery<L> } | ListRefusal

/** A declaration as defineList returns it: filter and sort keys stay literal. */
export type ListDecl<F extends Record<string, FilterDef> = Record<string, FilterDef>, S extends Record<string, SortDef> = Record<string, SortDef>> = Omit<ListDeclaration, 'filters' | 'sorts'> & { filters: F, sorts: S }

/**
 * Checks every key of an address against a declaration. An unknown key, value, sort or view answers
 * `{ ok: false, key }` naming it; the server turns that into core.list.unknown. `can` says whether the
 * viewer holds an ability. `today` is the theatre's day, for date presets.
 */
export function decodeList<L extends ListDeclaration>(query: Query, list: L, options: { can?: (ability: string) => boolean, today: string }): ListDecoding<L> {
  const bad = (key: string, reason: string): ListRefusal => ({ ok: false, key, reason })
  const known = new Set<string>([...RESERVED_KEYS, ...Object.keys(list.filters)])
  for (const key of Object.keys(query)) if (!known.has(key)) return bad(key, 'This list has no such filter.')

  const view = one(query.view) ?? list.defaultView ?? null
  if (view && !list.views?.[view]) return bad('view', 'This list has no such view.')
  const viewDef = view ? list.views?.[view] : undefined

  const sortKey = one(query.sort) ?? viewDef?.sort ?? list.defaultSort?.key ?? Object.keys(list.sorts)[0]
  if (!sortKey || !(sortKey in list.sorts)) return bad('sort', 'This list cannot be sorted that way.')
  const orderWord = one(query.order)
  if (orderWord && orderWord !== 'asc' && orderWord !== 'desc') return bad('order', 'Order is asc or desc.')
  const natural = list.sorts[sortKey]!.natural
  const given = viewDef?.sort ? { key: viewDef.sort, order: viewDef.order } : list.defaultSort
  const order: 'asc' | 'desc' = (orderWord as 'asc' | 'desc' | undefined) ?? (sortKey === given?.key ? given.order : undefined) ?? natural ?? 'asc'

  const page = one(query.page) === undefined ? 1 : Number(one(query.page))
  if (!Number.isInteger(page) || page < 1) return bad('page', 'Page is a whole number from 1.')
  const size = one(query.size) === undefined ? DEFAULT_PAGE_SIZE : Number(one(query.size))
  if (!(PAGE_SIZES as readonly number[]).includes(size)) return bad('size', `Size is ${PAGE_SIZES.join(', ')}.`)

  const raw: Record<string, string> = { ...(viewDef?.filters ?? {}) }
  for (const key of Object.keys(list.filters)) {
    const v = one(query[key])
    if (v) raw[key] = v
  }
  const filters: Record<string, FilterValue> = {}
  const dropped: string[] = []
  for (const [key, text] of Object.entries(raw)) {
    const def = list.filters[key]!
    if (def.ability && !options.can?.(def.ability)) {
      dropped.push(key)
      continue
    }
    const value = decodeFilter(def, text, options.today)
    if (value === undefined) return bad(key, 'That is not a value this filter takes.')
    filters[key] = value
  }
  const words = (one(query.q) ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().split(/\s+/).filter(Boolean)
  return { ok: true, value: { words, filters, dropped, view, sort: { key: sortKey, order }, page, size } as ListQuery<L> }
}

/** The kit's name for the strict reading. */
export const parse = decodeList

function decodeFilter(def: FilterDef, text: string, today: string): FilterValue | undefined {
  const has = (options: ListOption[] | undefined, v: string) => !options || options.some(o => o.value === v)
  switch (def.kind) {
    case 'choice': return has(def.options, text) ? text : undefined
    case 'choices': {
      const all = text.split(',').filter(Boolean)
      return all.length && all.every(v => has(def.options, v)) ? all : undefined
    }
    case 'yes-no': return text === 'yes' ? true : text === 'no' ? false : undefined
    case 'dates': return resolveDates(text, today) ?? undefined
    case 'grouped': {
      const [group, item, ...extra] = text.split('.')
      const g = def.groups?.find(x => x.value === group)
      if (!g || extra.length || (item !== undefined && !g.items.some(i => i.value === item))) return undefined
      return { group: group!, item }
    }
    default: return text.length <= 200 ? text : undefined // lookup: an id; whether it resolves is the route's to say
  }
}

/** How many filters are on. Search is not counted: it has its own box. */
export function filterCount(state: ListState): number {
  return Object.keys(state.filters).length
}
export function activeFilterCount(state: ListState): number {
  return filterCount(state) + (state.search ? 1 : 0)
}

/** The words a direction is given in, by the type of what is sorted. */
export function directionWords(type: SortDef['type'], order: 'asc' | 'desc'): { short: string, long: string } {
  const words = {
    text: { asc: 'A to Z', desc: 'Z to A' },
    date: { asc: 'Soonest first', desc: 'Newest first' },
    number: { asc: 'Lowest first', desc: 'Highest first' },
  }
  return { short: words[type][order], long: words[type][order] }
}

/** The days a date filter's value covers, worked out against `today` (the theatre's day, YYYY-MM-DD). */
export function resolveDates(value: string, today: string): { from?: string, to?: string } | null {
  const day = (offset: number) => {
    const d = new Date(`${today}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + offset)
    return d.toISOString().slice(0, 10)
  }
  const relative = /^(next)?(\d{1,4})d$/.exec(value)
  if (relative) return relative[1] ? { from: today, to: day(Number(relative[2])) } : { from: day(-Number(relative[2])), to: today }
  if (value === 'today') return { from: today, to: today }
  const range = /^(\d{4}-\d{2}-\d{2})(?:\.\.(\d{4}-\d{2}-\d{2}))?$/.exec(value)
  if (!range) return null
  return { from: range[1], to: range[2] ?? range[1] }
}

/** What a chip says for one filter that is on: "State: Draft, Published". Null when nothing is left to say. */
export function filterChipText(def: FilterDef, value: string, labels: { yes: string, no: string, unknown?: string } = { yes: 'Yes', no: 'No' }): string | null {
  const labelOf = (options: ListOption[] | undefined, v: string) => options?.find(o => o.value === v)?.label ?? v
  let text: string
  switch (def.kind) {
    case 'choice': text = labelOf(def.options, value); break
    case 'choices': text = value.split(',').filter(Boolean).map(v => labelOf(def.options, v)).join(', '); break
    case 'yes-no': text = value === 'yes' ? labels.yes : value === 'no' ? labels.no : ''; break
    case 'dates': text = def.presets?.find(p => p.value === value)?.label ?? value.replace('..', ' to '); break
    case 'grouped': {
      const [group, item] = value.split('.')
      const g = def.groups?.find(x => x.value === group)
      text = g ? (item ? labelOf(g.items, item) : g.label) : value
      break
    }
    default: text = value
  }
  return text ? `${def.label}: ${text}` : null
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
