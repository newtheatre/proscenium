// Erasure: a credit loses its link to the account, and the printed name stays, as it would on a
// printed programme (question 5, decided). Asking for the name to go as well is a later story.
import { sql } from 'drizzle-orm'
import { inAccountScope } from '#kit/accounts'
import type { ErasureHandler } from '../../points/erasure-handler'

export default {
  async erase(unit, subject) {
    if (!subject.accountId) return
    unit.add(sql`UPDATE core_production_credits SET account_id = NULL WHERE ${inAccountScope('account_id', subject.accountId)}`)
  },
} satisfies ErasureHandler
