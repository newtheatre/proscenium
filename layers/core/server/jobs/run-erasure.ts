// Runs one erasure (ID-16). Safe to repeat: a finished request or a tombstone writes nothing.
import { defineJob } from '#kit'
import { runErasure } from '../identity/data-requests'

export default defineJob<{ requestId: string }>(async (payload, unit) => runErasure(unit, payload.requestId))
