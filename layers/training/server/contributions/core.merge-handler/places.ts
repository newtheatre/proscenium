// Two places on one session after a merge: the stronger is kept (training-records part 3, P1).
import type { MergeHandler } from '#kit'
import { mergePlaces, undoMergePlaces } from '../../merge'

export default {
  merge: (unit, ref) => mergePlaces(unit, ref),
  undo: (unit, ref) => undoMergePlaces(unit, ref),
} satisfies MergeHandler
