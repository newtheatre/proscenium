import { z } from 'zod'
import { formatLondon } from '#shared/utils/london'
import { passRedemptionRefusal } from '#shared/utils/passes'
import { saysAlreadyAdmitted } from '#shared/utils/reservations'
import { fitsDoorLookUp, saysPassCoverage, saysPassTonight } from '#shared/utils/door'

// The door's pass lookup (D-126): a holder found by name or by the reference on their pass, with
// everything the card shows and the refusal it would meet, read live rather than guessed.
const form = z.object({
  q: z.string().trim().refine(fitsDoorLookUp, 'Type a name or a reference that fits the lookup'),
  performanceId: z.string().trim().min(1),
})

// What the scan says about tonight's own admission before any rule about the pass itself.
function tonightRefusal(tonightAt: number | null, tonightStatus: string | null): string | null {
  if (tonightAt === null || tonightStatus === null) return null
  if (tonightStatus === 'DOOR') return saysAlreadyAdmitted(tonightAt)
  return tonightStatus === 'PENDING' || tonightStatus === 'COLLECTED' ? null : 'This pass\'s admission for tonight was cancelled'
}

export default defineEventHandler(async (event) => {
  const input = await getValidatedQueryOrThrow(event, form)
  await requireNightAuthority(event, 'DOOR', { performanceId: input.performanceId })

  const performance = await performanceById(input.performanceId)
  if (!performance) throw noSuch('performance')

  const now = Math.floor(Date.now() / 1000)
  const found = await doorPassSearch(input.q, input.performanceId, performance.showId)

  return {
    items: found.map((pass) => {
      const tonight = saysPassTonight(pass.tonightAt, pass.tonightStatus)
      return {
        id: pass.id,
        reference: pass.reference,
        holderName: pass.holderName,
        passTypeName: pass.passTypeName,
        covers: saysPassCoverage(pass.passTypeSlug, pass.coveredCount),
        active: pass.status === 'ACTIVE',
        tonight: tonight.line,
        admittedTonight: tonight.admitted,
        lastUsed: pass.lastUsedTitle && pass.lastUsedAt
          ? `${pass.lastUsedTitle} · ${formatLondon(new Date(pass.lastUsedAt * 1000), { day: 'numeric', month: 'short' })}`
          : null,
        // The same refusals the scan gives, tonight's own included, read off the card rather than
        // out of an error, so a card never offers Admit one it would refuse (criterion 2, 0233).
        refusal: tonightRefusal(pass.tonightAt, pass.tonightStatus) ?? passRedemptionRefusal({
          status: pass.status,
          passTypeStatus: pass.passTypeStatus,
          validFrom: pass.validFrom,
          validUntil: pass.validUntil,
          coversShow: pass.coversShow === 1,
          anonymised: pass.anonymised === 1,
        }, now),
      }
    }),
  }
})
