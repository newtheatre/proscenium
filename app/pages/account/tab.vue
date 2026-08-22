<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

interface ChargeItem { name: string, qty: number, unitPricePence: number }
interface Charge { id: string, takenAt: string, totalPence: number, settledAt: string | null, items: ChargeItem[] }

useHead({ title: 'Bar tab' })

const requestFetch = useRequestFetch()
const { data, error } = await useAsyncData('account-bar-tab', () =>
  requestFetch<{ outstanding: Charge[], settled: Charge[], outstandingPence: number }>('/api/bar/tabs/mine'))

const outstanding = computed<Charge[]>(() => data.value?.outstanding ?? [])
const settled = computed<Charge[]>(() => data.value?.settled ?? [])

function describe(charge: Charge): string {
  return charge.items.map(i => `${i.qty} x ${i.name}`).join(', ') || 'Bar items'
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold">
        Bar tab
      </h1>
      <p class="mt-1 text-muted">
        Snacks and soft drinks you have put on your tab. Settle up by card with whoever
        has the reader.
      </p>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="We could not load your tab"
      :description="error.statusMessage || 'Try again in a moment.'"
    />

    <UCard v-else>
      <template #header>
        <div class="flex items-baseline justify-between gap-3">
          <h2 class="font-semibold">
            Outstanding
          </h2>
          <span class="font-mono text-xl font-bold">{{ formatMoney(data?.outstandingPence ?? 0) }}</span>
        </div>
      </template>

      <ul
        v-if="outstanding.length"
        class="divide-y divide-default"
      >
        <li
          v-for="charge in outstanding"
          :key="charge.id"
          class="flex items-start justify-between gap-3 py-2"
        >
          <div class="min-w-0">
            <p class="truncate text-sm">
              {{ describe(charge) }}
            </p>
            <p class="text-xs text-muted">
              {{ formatDateTime(charge.takenAt) }}
            </p>
          </div>
          <span class="shrink-0 font-mono text-sm">{{ formatMoney(charge.totalPence) }}</span>
        </li>
      </ul>
      <p
        v-else
        class="text-sm text-muted"
      >
        Nothing outstanding.
      </p>

      <template #footer>
        <UButton
          to="/bar/tab"
          icon="i-lucide-beer"
          label="Put something on my tab"
        />
      </template>
    </UCard>

    <UCard v-if="settled.length">
      <template #header>
        <h2 class="font-semibold">
          Settled
        </h2>
      </template>
      <ul class="divide-y divide-default">
        <li
          v-for="charge in settled"
          :key="charge.id"
          class="flex items-start justify-between gap-3 py-2"
        >
          <div class="min-w-0">
            <p class="truncate text-sm">
              {{ describe(charge) }}
            </p>
            <p class="text-xs text-muted">
              Paid {{ formatDate(charge.settledAt) }}
            </p>
          </div>
          <span class="shrink-0 font-mono text-sm">{{ formatMoney(charge.totalPence) }}</span>
        </li>
      </ul>
    </UCard>
  </div>
</template>
