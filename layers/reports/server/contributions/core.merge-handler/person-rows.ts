// Rule P7: a copy holding rows for both merged people would count one person twice, so each copy the
// merge touches is marked stale before core moves its rows; Reports never adds them up itself.
import type { MergeHandler } from '#kit'
import { staleOnMerge } from '../../people'

export default {
  merge: (unit, ref) => staleOnMerge(unit, ref),
  undo: () => ({ notRestored: 0 }),
} satisfies MergeHandler
