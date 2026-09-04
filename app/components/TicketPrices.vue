<script setup lang="ts">
import { saysPrice, saysPriceSource } from '#shared/utils/ticket-types'
import type { PriceSource } from '#shared/utils/ticket-types'

// One level of the price chain, with every level shown beside it so an operator can see why a
// price is what it is (D-120 criterion 2). Money is pence here and pounds only in the field (0004).

export interface PricedType {
  ticketTypeId: string
  name: string
  archived: boolean
  basePrice: number
  activeByDefault: boolean
  showPrice: number | null
  showActive: boolean | null
  performancePrice: number | null
  performanceActive: boolean | null
  price: number
  source: PriceSource
  active: boolean
}

const props = defineProps<{
  // Which level this screen sets. The other one is shown and not editable here.
  level: 'show' | 'performance'
  endpoint: string
}>()

const toast = useToast()
const request = useRequestFetch()
const saving = ref(false)
const failure = ref<string | null>(null)

const { data, status, refresh } = await useAsyncData(
  () => `prices-${props.endpoint}`,
  () => request<{ items: PricedType[] }>(props.endpoint),
  { default: (): { items: PricedType[] } => ({ items: [] }) },
)

interface Edited { price: number | null, active: boolean | null }

const edited = ref(new Map<string, Edited>())

// Seeded per endpoint rather than per refresh, so a reload elsewhere on the screen cannot throw
// away a price nobody has pressed Save on yet.
watch(() => props.endpoint, () => {
  edited.value = new Map(data.value.items.map(item => [item.ticketTypeId, {
    price: props.level === 'show' ? item.showPrice : item.performancePrice,
    active: props.level === 'show' ? item.showActive : item.performanceActive,
  }]))
}, { immediate: true })

watch(() => data.value.items, (items) => {
  if (edited.value.size === 0) {
    edited.value = new Map(items.map(item => [item.ticketTypeId, {
      price: props.level === 'show' ? item.showPrice : item.performancePrice,
      active: props.level === 'show' ? item.showActive : item.performanceActive,
    }]))
  }
})

const at = (id: string): Edited => edited.value.get(id) ?? { price: null, active: null }

// The field takes pounds and the request carries pence, converted here and nowhere else (0004).
function poundsFor(id: string): number | undefined {
  const price = at(id).price
  return price === null ? undefined : price / 100
}

function setPounds(id: string, value: number | undefined): void {
  const next = new Map(edited.value)
  next.set(id, { ...at(id), price: value === undefined || Number.isNaN(value) ? null : Math.round(value * 100) })
  edited.value = next
}

function setActive(id: string, value: boolean | null): void {
  const next = new Map(edited.value)
  next.set(id, { ...at(id), active: value })
  edited.value = next
}

function clear(id: string): void {
  const next = new Map(edited.value)
  next.set(id, { price: null, active: null })
  edited.value = next
}

// What this level would resolve to with the edits in hand, so the figure moves as somebody types.
// Computed once per render rather than read from the template, which asks three times a row.
const resolvedByType = computed(() => {
  const map = new Map<string, { price: number, source: PriceSource, active: boolean }>()
  for (const item of data.value.items) {
    const mine = at(item.ticketTypeId)
    const show = props.level === 'show'
      ? { price: mine.price, active: mine.active }
      : { price: item.showPrice, active: item.showActive }
    const performance = props.level === 'performance' ? { price: mine.price, active: mine.active } : null
    map.set(item.ticketTypeId, resolvePrice({ price: item.basePrice, activeByDefault: item.activeByDefault }, show, performance))
  }
  return map
})

function resolvedNow(item: PricedType): { price: number, source: PriceSource, active: boolean } {
  return resolvedByType.value.get(item.ticketTypeId) ?? { price: item.basePrice, source: 'BASE', active: item.activeByDefault }
}

async function save(): Promise<void> {
  saving.value = true
  failure.value = null
  try {
    await $fetch(props.endpoint, {
      method: 'PUT',
      body: {
        overrides: [...edited.value].map(([ticketTypeId, one]) => ({
          ticketTypeId,
          price: one.price,
          active: one.active,
        })),
      },
    })
    toast.add({
      title: 'Prices saved',
      description: 'New reservations take these. Every ticket already sold keeps the price it sold at.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    await refresh()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UCard data-test="ticket-prices">
    <template #header>
      <h3 class="font-semibold">
        Prices
      </h3>
    </template>

    <div class="space-y-4">
      <UAlert
        v-if="failure"
        data-test="prices-failure"
        color="error"
        variant="subtle"
        :description="failure"
      />

      <p class="text-sm text-muted">
        A price resolves this performance, then the show, then the ticket type. Leave a field empty
        to inherit; an explicit nought is a free ticket and not an absence. Changing a price here
        never reprices a ticket already sold.
      </p>

      <p
        v-if="data.items.length === 0 && status !== 'pending'"
        class="text-sm text-muted"
        data-test="prices-empty"
      >
        No ticket types yet. Add one under Box office, Ticket types, and it appears here to price.
      </p>

      <ul
        v-else
        class="divide-y divide-default"
      >
        <li
          v-for="item in data.items"
          :key="item.ticketTypeId"
          class="space-y-2 py-3"
          :data-test="`price-${item.ticketTypeId}`"
        >
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span class="font-medium">{{ item.name }}</span>
            <UBadge
              v-if="item.archived"
              color="neutral"
              variant="subtle"
              size="sm"
            >
              Archived
            </UBadge>
            <span class="text-xs text-muted">Base {{ saysPrice(item.basePrice) }}</span>
            <span
              v-if="level === 'performance' && item.showPrice !== null"
              class="text-xs text-muted"
            >
              Show {{ saysPrice(item.showPrice) }}
            </span>

            <div class="ms-auto flex flex-wrap items-center gap-2">
              <UInputNumber
                :model-value="poundsFor(item.ticketTypeId)"
                :min="0"
                :step="0.5"
                :format-options="{ style: 'currency', currency: 'GBP' }"
                placeholder="Inherit"
                class="w-40"
                :data-test="`price-field-${item.ticketTypeId}`"
                @update:model-value="value => setPounds(item.ticketTypeId, value)"
              />
              <USelect
                :model-value="at(item.ticketTypeId).active"
                :items="[
                  { label: 'Inherit', value: null },
                  { label: 'On sale', value: true },
                  { label: 'Off sale', value: false },
                ]"
                class="w-32"
                :data-test="`active-${item.ticketTypeId}`"
                @update:model-value="value => setActive(item.ticketTypeId, value as boolean | null)"
              />
              <UButton
                size="sm"
                color="neutral"
                variant="ghost"
                label="Inherit"
                :data-test="`clear-${item.ticketTypeId}`"
                @click="clear(item.ticketTypeId)"
              />
            </div>
          </div>

          <p
            class="text-xs text-muted"
            :data-test="`resolved-${item.ticketTypeId}`"
          >
            Sells at {{ saysPrice(resolvedNow(item).price) }}, from {{ saysPriceSource(resolvedNow(item).source).toLowerCase() }}.
            <span v-if="!resolvedNow(item).active">Off sale at this level.</span>
          </p>
        </li>
      </ul>

      <div
        v-if="data.items.length"
        class="flex justify-end"
      >
        <UButton
          :loading="saving"
          data-test="save-prices"
          @click="save"
        >
          Save prices
        </UButton>
      </div>
    </div>
  </UCard>
</template>
