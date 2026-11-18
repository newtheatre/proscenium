// Runs one stage of an erasure and queues the next (ID-16). Safe to repeat: a stage already run, a
// finished request or a tombstone writes nothing.
import { defineJob } from '#kit'
import { runErasure, type RunErasurePayload } from '../identity/data-requests'

export default defineJob<RunErasurePayload>(async (payload, unit) => runErasure(unit, payload))
