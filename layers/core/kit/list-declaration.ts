// The pure part of a list (defineList and its types) for a module's own shared/lists.ts, which both
// its pages and its list sources import. Safe in the browser: nothing here touches the server.
export { defineList, RESERVED_KEYS } from '../shared/list'
export type { FilterDef, FilterKind, ListDeclaration, ListOption, SortDef, ColumnDef, ViewDef } from '../shared/list'
