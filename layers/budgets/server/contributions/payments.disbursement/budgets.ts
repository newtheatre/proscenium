// Budgets' handler for money paid out against a claim (BC-30, BC-31): its record is a claim id.
import type { UnitView } from '#kit'
import { getClaim } from '../../claims'
import { reversePart, settlePart } from '../../paying'

interface Part { disbursementId: string, ownerRecord: string, amountMinor: number, currency: string }

export default {
  settle: (unit: UnitView, part: Part) => settlePart(unit, part),
  reversed: (unit: UnitView, part: Part) => reversePart(unit, part),
  async payee(record: string) {
    const claim = await getClaim(record)
    return claim?.claimantId ? { module: 'core', id: claim.claimantId } : null
  },
}
