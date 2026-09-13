import { z } from 'zod'
import { formatLondon } from '#shared/utils/london'
import { passRedemptionRefusal } from '#shared/utils/passes'
import { saysPassCoverage, saysPassTonight } from '#shared/utils/door'

// Pass mode's lookup (D-126): a holder found by name or by the reference on their pass, with
// everything the card shows and the refusal it would meet, read live rather than guessed.
const form = z.object({
  q: z.string().trim().min(2).max(120),
  performanceId: z.string().trim().min(1),
})

export default defineEventHandler(async (event) => {
  const input = await getValidatedQueryOrThrow(event, form)
  await requireNightAuthority(event, 'DOOR', { performanceId: input.performanceId })

  const performance = await performanceById(input.performanceId)
  if (!performance) throw createError({ statusCode: 404, statusMessage: 'No such performance' })

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
        // The same predicate the scan enforces, shown before the volunteer presses Admit so the
        // refusal is read off the card rather than out of an error (criterion 2).
        refusal: passRedemptionRefusal({
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
