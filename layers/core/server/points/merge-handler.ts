// Contract for core.merge-handler: a module's MergeHandler from the kit, for its onMerge 'handler'
// columns. `merge` fits one unit, is safe to run twice, lists every row it changes with
// recordMergeItems and may answer NOT_YET; the optional `undo` answers { notRestored, reason }.
export type { MergeHandler } from '#kit'
