import { describe, expect, test } from 'bun:test'
import { effectScope, ref } from 'vue'
import { useTillComp } from '#composables/useTillComp'
import type { TillCompLine } from '#composables/useTillComp'
import type { CompRequest } from '#shared/utils/comps'
import type { PricedBasket } from '#shared/utils/sale'

// Issue 1299, F-106 criterion 5: a comp asks for Challenge 25 on the same answer as a sale. A till
// that loaded its drinks before an item was switched on learns it from the give's own refusal.

const priced: PricedBasket = {
  totalPence: 500,
  discount: null,
  lines: [{ variantId: 'v-1', productName: 'Cider', variantLabel: 'Pint', choiceItemName: null, qty: 1, unitPricePence: 500, priceSource: 'variant', amountPence: 500, discountPence: 0 }],
}

const refusal = {
  data: { statusMessage: 'Cider needs a Challenge 25 outcome before this can be given', data: { ageCheckFor: ['Cider'] } },
}

function setup(markedOnRefresh: boolean) {
  const restricted = ref(false)
  const scope = effectScope()
  const comp = scope.run(() => useTillComp({
    venueId: ref<string | null>('venue-1'),
    isLineRestricted: (_line: TillCompLine) => restricted.value,
    requestComp: async () => ({ id: 'request-1', priced }),
    pollRequest: async () => ({ request: { id: 'request-1', status: 'APPROVED', expired: false } as unknown as CompRequest }),
    giveComp: async () => {
      throw refusal
    },
    refreshCatalogue: async () => {
      restricted.value = markedOnRefresh
    },
  }))!
  return { comp, scope }
}

async function askedAndApproved(comp: ReturnType<typeof setup>['comp']): Promise<void> {
  comp.reason.value = 'A round on the house'
  await comp.send([{ variantId: 'v-1', qty: 1, choiceItemId: null }])
}

describe('a comp the server says asks for Challenge 25 opens the prompt (issue 1299)', () => {
  test('the drinks read again mark the line, and the give asks rather than failing', async () => {
    const { comp, scope } = setup(true)
    await askedAndApproved(comp)
    expect(comp.needsAgeCheck.value).toBe(false)

    expect(await comp.give(null)).toBe(true)
    expect(comp.needsAgeCheck.value).toBe(true)
    expect(comp.giveFailure.value).toBeNull()
    comp.reset()
    scope.stop()
  })

  test('a read that leaves the line unmarked shows the refusal, and asks nothing', async () => {
    const { comp, scope } = setup(false)
    await askedAndApproved(comp)

    expect(await comp.give(null)).toBe(false)
    expect(comp.needsAgeCheck.value).toBe(false)
    expect(comp.giveFailure.value).toContain('Challenge 25')
    comp.reset()
    scope.stop()
  })
})
