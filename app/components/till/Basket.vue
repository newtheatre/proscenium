<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import type { Discount } from '#shared/utils/discounts'
import type { PricedBasket, TillBooking } from '#shared/utils/sale'
import type { TabHolder } from '~/composables/useTillCatalogue'
import type { BasketLine, WalkUpLine } from '~/composables/useTillBasket'

// The basket (F-122 criterion 3): drinks, ticket money and walk-ups in one list, one total.

defineProps<{
  ticketLines: TillBooking[]
  walkUpLines: WalkUpLine[]
  basket: BasketLine[]
  lineAmount: (line: BasketLine) => string | null
  removeBooking: (id: string) => void
  removeWalkUp: (line: WalkUpLine) => void
  decrementLine: (line: BasketLine) => void
  incrementLine: (line: BasketLine) => void
  removeLine: (line: BasketLine) => void
  discounts: Discount[]
  tabHolders: TabHolder[]
  hasTicketMoney: boolean
  chargeFailure: string | null
  priceFailure: string | null
  priced: PricedBasket | null
  grandTotalPence: number | null
  pricing: boolean
  ticketsPence: number
  walkUpsPence: number
}>()

const selectedDiscountId = defineModel<string | null>('selectedDiscountId', { required: true })
const selectedTabHolderId = defineModel<string | null>('selectedTabHolderId', { required: true })
</script>

<template>
  <div
    class="space-y-3 border-t border-default pt-4"
    data-test="basket"
  >
    <h2 class="text-sm font-semibold text-muted">
      Basket
    </h2>
    <!-- Ticket money beside the drinks, one basket (F-122 criterion 3). -->
    <div
      v-for="line in ticketLines"
      :key="line.id"
      class="flex items-center justify-between gap-2"
      :data-test="`ticket-line-${line.id}`"
    >
      <div class="min-w-0">
        <p class="truncate text-sm font-medium text-secondary">
          Booking {{ line.reference }}<span v-if="line.bookerFirstName">, {{ line.bookerFirstName }}</span>
        </p>
        <p class="text-xs text-muted">
          {{ line.showTitle }} · {{ saysMoney(line.owedPence) }}
        </p>
      </div>
      <UButton
        size="sm"
        color="error"
        variant="ghost"
        icon="i-lucide-x"
        class="size-12"
        :aria-label="`Remove booking ${line.reference}`"
        :data-test="`ticket-line-remove-${line.id}`"
        @click="removeBooking(line.id)"
      />
    </div>
    <div
      v-for="line in walkUpLines"
      :key="`${line.performanceId}:${line.ticketTypeId}`"
      class="flex items-center justify-between gap-2"
      :data-test="`walk-up-line-${line.ticketTypeId}`"
    >
      <div class="min-w-0">
        <p class="truncate text-sm font-medium text-secondary">
          Walk-up · {{ line.quantity }} × {{ line.typeName }}
        </p>
        <p class="text-xs text-muted">
          {{ line.showTitle }} · {{ saysMoney(line.unitPrice * line.quantity) }}
        </p>
      </div>
      <UButton
        size="sm"
        color="error"
        variant="ghost"
        icon="i-lucide-x"
        class="size-12"
        :aria-label="`Remove the ${line.typeName} walk-up`"
        :data-test="`walk-up-line-remove-${line.ticketTypeId}`"
        @click="removeWalkUp(line)"
      />
    </div>
    <div
      v-for="line in basket"
      :key="line.id"
      class="flex items-center justify-between gap-2"
      :data-test="`line-${line.id}`"
    >
      <div class="min-w-0">
        <p class="truncate text-sm font-medium">
          {{ line.productName }}, {{ line.variantLabel }}<span v-if="line.choiceItemName">, {{ line.choiceItemName }}</span>
        </p>
        <p
          class="text-xs text-muted"
          :data-test="`line-amount-${line.id}`"
        >
          {{ lineAmount(line) ?? 'Pricing…' }}
        </p>
      </div>
      <div class="flex items-center gap-1">
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-lucide-minus"
          class="size-12"
          :aria-label="`One fewer ${line.variantLabel}`"
          :data-test="`line-minus-${line.id}`"
          @click="decrementLine(line)"
        />
        <span
          class="w-6 text-center text-sm"
          :data-test="`line-qty-${line.id}`"
        >{{ line.qty }}</span>
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-lucide-plus"
          class="size-12"
          :aria-label="`One more ${line.variantLabel}`"
          :data-test="`line-plus-${line.id}`"
          @click="incrementLine(line)"
        />
        <UButton
          size="sm"
          color="error"
          variant="ghost"
          icon="i-lucide-x"
          class="size-12"
          :aria-label="`Remove ${line.variantLabel}`"
          :data-test="`line-remove-${line.id}`"
          @click="removeLine(line)"
        />
      </div>
    </div>

    <ChoiceChips
      v-if="discounts.length"
      v-model="selectedDiscountId"
      container-test-id="discount-picker"
      label="Discount"
      none-label="None"
      none-test-id="discount-none"
      item-test-prefix="discount"
      :items="discounts.map(discount => ({ id: discount.id, label: `${discount.name} (-${discount.percent}%)` }))"
    />

    <ChoiceChips
      v-if="tabHolders.length && !hasTicketMoney"
      v-model="selectedTabHolderId"
      container-test-id="tab-holder-picker"
      label="Charge to"
      none-label="The reader"
      none-test-id="tab-holder-none"
      item-test-prefix="tab-holder"
      :items="tabHolders.map(holder => ({ id: holder.id, label: `${holder.name}'s tab` }))"
    />

    <UAlert
      v-if="chargeFailure"
      data-test="charge-failure"
      color="error"
      variant="subtle"
      :description="chargeFailure"
    />
    <UAlert
      v-if="priceFailure"
      data-test="price-failure"
      color="error"
      variant="subtle"
      :description="priceFailure"
    />
    <template v-else>
      <p
        v-if="priced?.discount"
        class="flex items-center justify-between text-xs text-muted"
        data-test="basket-discount"
      >
        <span>{{ priced.discount.name }} (-{{ priced.discount.percent }}%)</span>
        <span>-{{ saysMoney(priced.lines.reduce((sum, line) => sum + line.discountPence, 0)) }}</span>
      </p>
      <p
        class="flex items-center justify-between text-base font-semibold"
        data-test="basket-total"
      >
        <span>Total</span>
        <span data-test="basket-total-amount">{{ grandTotalPence !== null && !pricing ? saysMoney(grandTotalPence) : 'Pricing…' }}</span>
      </p>
      <p
        v-if="hasTicketMoney && basket.length"
        class="text-xs text-muted"
        data-test="basket-split"
      >
        Bar {{ priced && !pricing ? saysMoney(priced.totalPence) : '…' }} · tickets {{ saysMoney(ticketsPence + walkUpsPence) }}, in one reader transaction
      </p>
    </template>
  </div>
</template>
