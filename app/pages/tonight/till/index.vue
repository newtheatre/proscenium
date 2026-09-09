<script setup lang="ts">
import { londonClock } from '#shared/utils/london'
import { says, saysMoney } from '#shared/utils/bar'
import { MAX_BASKET_LINE_QTY } from '#shared/utils/sale'
import { nightCacheKey } from '#shared/utils/night-cache'
import { currentShowNight } from '#shared/utils/show-night'
import type { PricedBasket, SaleCatalogue, SaleChoice, SaleProduct, SaleReceipt, SaleVariant } from '#shared/utils/sale'
import type { TillSession } from '#shared/utils/till'

definePageMeta({ layout: 'tonight' })
useSeoMeta({ title: 'Till' })

// The guard is the route's, not this screen's: what a refusal says is written where it is
// raised, so this only ever displays it (E-111 criterion 5).
const request = useRequestFetch()
const route = useRoute()
// Optional: names which venue when more than one runs tonight, which the route already resolves
// unaided on the (typical) night only one does. Multi-venue bars are their own story (F-202).
const requestedVenueId = computed(() => (typeof route.query.venueId === 'string' ? route.query.venueId : undefined))
const syncedAt = ref<Date | null>(null)
const failure = ref<string | null>(null)
const busy = ref(false)
const session = ref<TillSession | null>(null)
const venueId = ref<string | null>(null)

async function load(): Promise<void> {
  busy.value = true
  failure.value = null
  try {
    const status = await request<{ night: string, venueId: string, session: TillSession | null }>('/api/till', {
      query: { venueId: requestedVenueId.value },
    })
    session.value = status.session
    venueId.value = status.venueId
    syncedAt.value = new Date()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    busy.value = false
  }
}

async function open(): Promise<void> {
  busy.value = true
  failure.value = null
  try {
    const opened = await request<{ session: TillSession }>('/api/till', {
      method: 'POST',
      body: { venueId: requestedVenueId.value },
    })
    session.value = opened.session
    syncedAt.value = new Date()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    busy.value = false
  }
}

async function close(): Promise<void> {
  if (!session.value) return
  busy.value = true
  failure.value = null
  try {
    const closed = await request<{ session: TillSession }>('/api/till/close', {
      method: 'POST',
      body: { id: session.value.id },
    })
    session.value = closed.session
    syncedAt.value = new Date()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    busy.value = false
  }
}

onMounted(load)

// The catalogue, held on the device so venue Wi-Fi dropping mid-service never blanks the grid
// (K-103). Whole-night, not venue-scoped: products, variants and prices are estate-wide (F-202).
const catalogueKey = computed(() => nightCacheKey({ screen: 'till-products', night: currentShowNight(), wholeNight: true }))
const catalogue = useNightCache<SaleCatalogue>(catalogueKey, () =>
  request<SaleCatalogue>('/api/till/products', { query: { venueId: venueId.value ?? undefined } }), { immediate: false })

watch([session, venueId], () => {
  if (session.value && venueId.value) void catalogue.refresh()
})

const categories = computed(() => catalogue.data.value?.categories ?? [])
const products = computed(() => catalogue.data.value?.products ?? [])
const productsIn = (categoryId: string): SaleProduct[] => products.value.filter(product => product.categoryId === categoryId)

// Who the till may charge a sale to instead of the reader (F-108). The allow-list is short by
// nature, so this refreshes alongside the catalogue rather than needing its own trigger.
interface TabHolder { id: string, name: string }
const tabHoldersKey = computed(() => nightCacheKey({ screen: 'till-tab-holders', night: currentShowNight(), wholeNight: true }))
const tabHolders = useNightCache<{ holders: TabHolder[] }>(tabHoldersKey, () =>
  request<{ holders: TabHolder[] }>('/api/till/tab-holders', { query: { venueId: venueId.value ?? undefined } }), { immediate: false })

watch([session, venueId], () => {
  if (session.value && venueId.value) void tabHolders.refresh()
})

const selectedTabHolderId = ref<string | null>(null)

interface BasketLine {
  id: string
  variantId: string
  productName: string
  variantLabel: string
  choiceItemId: string | null
  choiceItemName: string | null
  qty: number
}

const basket = ref<BasketLine[]>([])

function addLine(productName: string, variant: SaleVariant, choiceItemId: string | null, choiceItemName: string | null): void {
  const existing = basket.value.find(line => line.variantId === variant.id && line.choiceItemId === choiceItemId)
  if (existing) existing.qty = Math.min(existing.qty + 1, MAX_BASKET_LINE_QTY)
  else {
    basket.value.push({
      id: crypto.randomUUID(),
      variantId: variant.id,
      productName,
      variantLabel: variant.label,
      choiceItemId,
      choiceItemName,
      qty: 1,
    })
  }
}

const choosing = ref<{ productName: string, variant: SaleVariant, choice: SaleChoice } | null>(null)

// A variant offering a choice prompts before the line lands, so the basket never holds an
// unresolved mixer waiting to be asked about later (F-103 criterion 2).
function tapVariant(productName: string, variant: SaleVariant): void {
  if (variant.choice) {
    choosing.value = { productName, variant, choice: variant.choice }
    return
  }
  addLine(productName, variant, null, null)
}

function chooseOption(optionId: string, optionName: string): void {
  if (!choosing.value) return
  addLine(choosing.value.productName, choosing.value.variant, optionId, optionName)
  choosing.value = null
}

function incrementLine(line: BasketLine): void {
  line.qty = Math.min(line.qty + 1, MAX_BASKET_LINE_QTY)
}

function removeLine(line: BasketLine): void {
  basket.value = basket.value.filter(entry => entry.id !== line.id)
}

function decrementLine(line: BasketLine): void {
  if (line.qty <= 1) removeLine(line)
  else line.qty -= 1
}

const priced = ref<PricedBasket | null>(null)
const pricing = ref(false)
const priceFailure = ref<string | null>(null)
let priceTimer: ReturnType<typeof setTimeout> | undefined

// Recomputed server-side on every change, never trusted from what the screen last showed (0004,
// F-103 criterion 3). Debounced, so a run of taps costs one request rather than one each.
async function recomputeTotal(): Promise<void> {
  if (basket.value.length === 0 || !venueId.value) {
    priced.value = null
    priceFailure.value = null
    return
  }
  pricing.value = true
  priceFailure.value = null
  try {
    priced.value = await $fetch<PricedBasket>('/api/till/price', {
      method: 'POST',
      body: {
        venueId: venueId.value,
        lines: basket.value.map(line => ({ variantId: line.variantId, qty: line.qty, choiceItemId: line.choiceItemId })),
      },
    })
  }
  catch (refused) {
    priceFailure.value = refusalText(refused)
  }
  finally {
    pricing.value = false
  }
}

watch(basket, () => {
  clearTimeout(priceTimer)
  if (basket.value.length === 0) {
    priced.value = null
    priceFailure.value = null
    return
  }
  priceTimer = setTimeout(() => void recomputeTotal(), 250)
}, { deep: true })

const charging = ref(false)
const chargeFailure = ref<string | null>(null)
const charged = ref<{ totalPence: number, tab: SaleReceipt['tab'] } | null>(null)

// The submission step (F-104, 0004, 0005 criteria 1, 2). A tab holder chosen below charges
// credit instead of the reader (F-108).
async function charge(): Promise<void> {
  if (!priced.value || !venueId.value || basket.value.length === 0) return
  charging.value = true
  chargeFailure.value = null
  try {
    const answered = await $fetch<SaleReceipt>('/api/till/sale', {
      method: 'POST',
      body: {
        venueId: venueId.value,
        lines: basket.value.map(line => ({ variantId: line.variantId, qty: line.qty, choiceItemId: line.choiceItemId })),
        expectedTotalPence: priced.value.totalPence,
        tabHolderId: selectedTabHolderId.value,
      },
    })
    charged.value = { totalPence: answered.totalPence, tab: answered.tab }
  }
  catch (refused) {
    chargeFailure.value = refusalText(refused)
    // The refusal already names the true figure; catch the total up to it too, so what is shown
    // under the message is the one a retry would now send (F-104 criterion 3, no bypass).
    await recomputeTotal()
  }
  finally {
    charging.value = false
  }
}

function nextSale(): void {
  basket.value = []
  priced.value = null
  charged.value = null
  chargeFailure.value = null
  selectedTabHolderId.value = null
}

// Editing the basket after a refusal is the correction; the message it was reading no longer
// describes what would be resubmitted, so it clears rather than going stale.
watch(basket, () => {
  chargeFailure.value = null
}, { deep: true })

function lineAmount(line: BasketLine): string | null {
  const index = basket.value.findIndex(entry => entry.id === line.id)
  const amount = priced.value?.lines[index]?.amountPence
  return amount === undefined ? null : saysMoney(amount)
}

// Opening the note never leaves the sale: this is a modal over the basket, never a navigation, so
// what was tapped in is still there on return (F-107 criterion 2).
const allergenOpen = ref<{ name: string, state: SaleProduct['allergenState'], note: string | null } | null>(null)
</script>

<template>
  <div>
    <NightScreen
      title="Till"
      :hint="session
        ? 'Tap a size to add it. Quantities and lines are editable before payment.'
        : 'Opening the till is one session for the whole night. Everyone at this venue sells against it.'"
      :stale="session ? catalogue.cachedAt.value : syncedAt"
      :busy="busy || catalogue.pending.value"
    >
      <UAlert
        v-if="failure"
        data-test="till-failure"
        color="error"
        variant="subtle"
        :description="failure"
      />

      <div
        v-else-if="session"
        class="space-y-6"
      >
        <p
          data-test="till-open"
          class="text-xs text-muted"
        >
          Open since {{ londonClock(new Date(session.openedAt * 1000)) }}.
        </p>

        <UAlert
          v-if="catalogue.error.value"
          data-test="catalogue-failure"
          color="warning"
          variant="subtle"
          description="Showing what was last loaded; the till could not refresh just now."
        />

        <p
          v-if="catalogue.data.value && products.length === 0"
          data-test="catalogue-empty"
          class="text-sm text-muted"
        >
          Nothing is on the till yet. Price a size in the catalogue, and it appears here.
        </p>

        <template v-if="!charged">
          <div
            v-for="category in categories"
            :key="category.id"
          >
            <template v-if="productsIn(category.id).length">
              <h2 class="mb-2 text-sm font-semibold text-muted">
                {{ category.name }}
              </h2>
              <div class="mb-4 space-y-2">
                <div
                  v-for="product in productsIn(category.id)"
                  :key="product.id"
                  class="rounded-lg border border-default p-2"
                  :data-test="`product-${product.id}`"
                >
                  <div class="flex items-start justify-between gap-1">
                    <span class="text-sm font-medium">{{ product.name }}</span>
                    <UButton
                      size="sm"
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-info"
                      class="min-h-12 min-w-12"
                      :aria-label="`Allergens for ${product.name}`"
                      :data-test="`allergen-${product.id}`"
                      @click="allergenOpen = { name: product.name, state: product.allergenState, note: product.allergenNote }"
                    />
                  </div>
                  <div class="mt-2 flex flex-wrap gap-2">
                    <UButton
                      v-for="variant in product.variants"
                      :key="variant.id"
                      color="neutral"
                      variant="subtle"
                      class="min-h-12 min-w-12"
                      :data-test="`variant-${variant.id}`"
                      @click="tapVariant(product.name, variant)"
                    >
                      {{ variant.label }} · {{ saysMoney(variant.pricePence) }}
                    </UButton>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <div
            v-if="basket.length"
            class="space-y-3 border-t border-default pt-4"
            data-test="basket"
          >
            <h2 class="text-sm font-semibold text-muted">
              Basket
            </h2>
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

            <div
              v-if="tabHolders.data.value?.holders.length"
              class="space-y-2"
              data-test="tab-holder-picker"
            >
              <p class="text-xs text-muted">
                Charge to
              </p>
              <div class="flex flex-wrap gap-2">
                <UButton
                  size="sm"
                  :color="selectedTabHolderId === null ? 'primary' : 'neutral'"
                  :variant="selectedTabHolderId === null ? 'solid' : 'subtle'"
                  class="min-h-10"
                  data-test="tab-holder-none"
                  @click="selectedTabHolderId = null"
                >
                  The reader
                </UButton>
                <UButton
                  v-for="holder in tabHolders.data.value.holders"
                  :key="holder.id"
                  size="sm"
                  :color="selectedTabHolderId === holder.id ? 'primary' : 'neutral'"
                  :variant="selectedTabHolderId === holder.id ? 'solid' : 'subtle'"
                  class="min-h-10"
                  :data-test="`tab-holder-${holder.id}`"
                  @click="selectedTabHolderId = holder.id"
                >
                  {{ holder.name }}'s tab
                </UButton>
              </div>
            </div>

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
            <p
              v-else
              class="flex items-center justify-between text-base font-semibold"
              data-test="basket-total"
            >
              <span>Total</span>
              <span data-test="basket-total-amount">{{ priced && !pricing ? saysMoney(priced.totalPence) : 'Pricing…' }}</span>
            </p>
          </div>
        </template>

        <div
          v-else
          class="space-y-4"
          data-test="charge-confirmation"
        >
          <UAlert
            color="success"
            variant="subtle"
            icon="i-lucide-check"
            :title="charged?.tab ? `On ${charged.tab.holderName}'s tab` : 'Key this into the reader'"
            :description="charged ? saysMoney(charged.totalPence) : ''"
          />
          <UAlert
            v-if="charged?.tab"
            data-test="tab-balance-note"
            color="info"
            variant="subtle"
            :description="`${charged.tab.holderName}'s tab now stands at ${saysMoney(charged.tab.outstandingPence)}${charged.tab.capOverridden ? ', over the cap, approved by a manager' : ''}`"
          />
          <UButton
            block
            size="xl"
            class="min-h-12"
            data-test="next-sale"
            @click="nextSale"
          >
            Start the next sale
          </UButton>
        </div>
      </div>

      <p
        v-else
        data-test="till-closed"
      >
        The till is not open yet.
      </p>

      <template #actions>
        <NightAction
          v-if="session && !charged && basket.length && priced"
          :label="selectedTabHolderId ? `Put ${saysMoney(priced.totalPence)} on the tab` : `Charge ${saysMoney(priced.totalPence)}`"
          :icon="selectedTabHolderId ? 'i-lucide-book-user' : 'i-lucide-credit-card'"
          :disabled="pricing"
          :loading="charging"
          @press="charge"
        />
        <NightAction
          v-if="session"
          label="Close till"
          icon="i-lucide-lock"
          color="error"
          :loading="busy"
          @press="close"
        />
        <NightAction
          v-else
          label="Open till"
          icon="i-lucide-lock-open"
          :loading="busy"
          @press="open"
        />
      </template>
    </NightScreen>

    <UModal
      :open="choosing !== null"
      :title="choosing ? choosing.choice.name : ''"
      description="Pick one; it depletes at no extra charge."
      @update:open="choosing = null"
    >
      <template #body>
        <div class="grid grid-cols-2 gap-2">
          <UButton
            v-for="option in choosing?.choice.options ?? []"
            :key="option.id"
            color="neutral"
            variant="subtle"
            class="min-h-12"
            :data-test="`choice-option-${option.id}`"
            @click="chooseOption(option.id, option.itemName)"
          >
            {{ option.itemName }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      :open="allergenOpen !== null"
      :title="allergenOpen ? `Allergens: ${allergenOpen.name}` : ''"
      @update:open="allergenOpen = null"
    >
      <template #body>
        <p
          data-test="allergen-state"
          class="font-medium"
        >
          {{ says(allergenOpen?.state ?? '') }}
        </p>
        <p
          v-if="allergenOpen?.note"
          data-test="allergen-note"
          class="mt-2 text-sm"
        >
          {{ allergenOpen.note }}
        </p>
      </template>
    </UModal>
  </div>
</template>
