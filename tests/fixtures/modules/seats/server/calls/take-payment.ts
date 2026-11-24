// A pretend payment provider. Tests set what the provider "knows" in `provider`.
import { sql } from 'drizzle-orm'
import { defineCall, type CallOutcome } from '#kit'

export const provider = { known: new Map<string, CallOutcome>() }

export default defineCall({
  outcome(unit, outcome, attempt) {
    unit.add(sql`UPDATE seats_charges SET state = ${outcome.result === 'succeeded' ? 'paid' : 'failed'}, provider_reference = ${outcome.providerReference ?? null} WHERE id = ${attempt.reference.split(':').pop()}`).expect(1)
  },
  async reconcile(attempt) {
    return provider.known.get(attempt.idempotencyKey) ?? 'unknown'
  },
  // In practice the trainee chooses on the practice card reader.
  practice: () => 'ask-trainee',
})
