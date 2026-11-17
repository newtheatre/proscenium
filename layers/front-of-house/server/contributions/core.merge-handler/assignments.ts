// When two accounts merge and both are on one shift, the one further along is kept and the other
// released, stamped with the merge; undo restores it where it still can (part 3).
import type { MergeHandler } from '#kit'
import { mergeAccounts, undoMerge } from '../../privacy'

export default {
  merge: (unit, ref) => mergeAccounts(unit, ref),
  undo: (unit, ref) => undoMerge(unit, ref),
} satisfies MergeHandler
