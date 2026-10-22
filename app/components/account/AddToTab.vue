<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import { selfTabTotal } from '#shared/utils/self-tab'
import type { SaleCatalogue } from '#shared/utils/sale'

// A holder adding to their own tab with nobody on the till (F-108 criterion 7, 0165). Only a
// holder, on a night a bar's till is open, sees it; the page re-reads the tab once it posts.
const emit = defineEmits<{ added: [] }>()

interface SelfTabBar { ok: true, night: string, bars: { venueId: string, name: string }[], catalogue: SaleCatalogue | null }

const request = useRequestFetch()
const { data, refresh } = await useAsyncData<SelfTabBar | null>(
  'account-tab-bar',
  () => request<SelfTabBar>('/api/account/tab/bar').catch(() => null),
)

const bars = computed(() => data.value?.bars ?? [])
const catalogue = computed(() => data.value?.catalogue ?? null)
const chosenBar = ref<string | null>(null)
const venueId = computed(() => chosenBar.value ?? (bars.value.length === 1 ? bars.value[0]!.venueId : null))

const quantities = ref<Record<string, number>>({})
const lines = computed(() => Object.entries(quantities.value).filter(([, qty]) => qty > 0).map(([variantId, qty]) => ({ variantId, qty })))
const totalPence = computed(() => (catalogue.value ? selfTabTotal(lines.value, catalogue.value) : null))

const adding = ref(false)
const failure = ref<string | null>(null)
const added = ref<string | null>(null)

function change(variantId: string, by: number): void {
  quantities.value = { ...quantities.value, [variantId]: Math.max(0, (quantities.value[variantId] ?? 0) + by) }
  added.value = null
}

async function add(): Promise<void> {
  if (!venueId.value || lines.value.length === 0 || totalPence.value === null) return
  adding.value = true
  failure.value = null
  try {
    await $fetch('/api/account/tab/charge', {
      method: 'POST',
      body: { venueId: venueId.value, lines: lines.value, expectedTotalPence: totalPence.value },
    })
    added.value = `${saysMoney(totalPence.value)} added to your tab.`
    quantities.value = {}
    emit('added')
  }
  catch (refused) {
    failure.value = writeFailureText(refused, 'Refresh your tab before adding it again.')
    await refresh()
  }
  finally {
    adding.value = false
  }
}
</script>

<template>
  <UCard
    v-if="catalogue && bars.length > 0"
    data-test="self-tab"
  >
    <template #header>
      <h2 class="text-lg font-semibold">
        Add to my tab
      </h2>
    </template>
    <div class="space-y-4">
      <p class="text-sm text-muted">
        Help yourself at the bar and put it on your tab here. Anything that needs a Challenge 25 check is served at the till.
      </p>

      <div
        v-if="bars.length > 1"
        class="flex flex-wrap gap-2"
      >
        <UButton
          v-for="bar in bars"
          :key="bar.venueId"
          :data-test="`self-tab-bar-${bar.venueId}`"
          :color="venueId === bar.venueId ? 'primary' : 'neutral'"
          :variant="venueId === bar.venueId ? 'solid' : 'outline'"
          @click="chosenBar = bar.venueId"
        >
          {{ bar.name }}
        </UButton>
      </div>
      <p
        v-else
        class="text-sm"
      >
        At {{ bars[0]!.name }}.
      </p>

      <ul class="divide-y divide-default text-sm">
        <template
          v-for="product in catalogue.products"
          :key="product.id"
        >
          <li
            v-for="variant in product.variants"
            :key="variant.id"
            class="flex items-center justify-between gap-3 py-2"
          >
            <span>{{ product.name }}, {{ variant.label }} <span class="text-muted">{{ saysMoney(variant.pricePence) }}</span></span>
            <span class="flex items-center gap-2">
              <UButton
                size="sm"
                color="neutral"
                variant="outline"
                icon="i-lucide-minus"
                :aria-label="`One fewer ${product.name}`"
                :disabled="!quantities[variant.id]"
                :data-test="`self-tab-less-${variant.id}`"
                @click="change(variant.id, -1)"
              />
              <span
                class="w-6 text-center tabular-nums"
                :data-test="`self-tab-qty-${variant.id}`"
              >{{ quantities[variant.id] ?? 0 }}</span>
              <UButton
                size="sm"
                color="neutral"
                variant="outline"
                icon="i-lucide-plus"
                :aria-label="`One more ${product.name}`"
                :data-test="`self-tab-more-${variant.id}`"
                @click="change(variant.id, 1)"
              />
            </span>
          </li>
        </template>
      </ul>

      <UAlert
        v-if="failure"
        data-test="self-tab-failure"
        color="error"
        variant="subtle"
        :description="failure"
      />
      <p
        v-if="added"
        class="text-sm text-success"
        data-test="self-tab-added"
      >
        {{ added }}
      </p>

      <UButton
        block
        data-test="self-tab-charge"
        :loading="adding"
        :disabled="!venueId || lines.length === 0 || totalPence === null"
        @click="add"
      >
        {{ totalPence && lines.length > 0 ? `Add ${saysMoney(totalPence)} to my tab` : 'Add to my tab' }}
      </UButton>
    </div>
  </UCard>
</template>
