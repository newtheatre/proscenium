// Stage two of a merge: moves one module's rows a unit at a time (part 4, Merge). Safe to repeat.
import { defineJob } from '#kit'
import { runMergeMove, type MergeMovePayload } from '../identity/merge-move'

export default defineJob<MergeMovePayload>(async (payload, unit, job) => runMergeMove(unit, payload, job))
