<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import { saysDay } from '#shared/utils/when'
import type { TabCharge } from '#shared/utils/tab-settlement'

// Settle a tab on the reader (F-109, 0162): pick who is paying, read back exactly what they owe,
// and start a typed card charge for it. Nothing is recorded until the reader answers on the till.

interface Owing { holderId: string, holderName: string, outstandingPence: number }

const props = defineProps<{ venueId: string | null }>()
const emit = defineEmits<{ started: [started: { id: string, totalPence: number }], settled: [] }>()
const open = defineModel<boolean>('open', { required: true })

const holders = ref<Owing[] | null>(null)
const holderId = ref<string | undefined>(undefined)
const charges = ref<TabCharge[] | null>(null)
const totalPence = ref(0)
const loading = ref(false)
const starting = ref(false)
const failure = ref<string | null>(null)

const scope = computed(() => (props.venueId ? { venueId: props.venueId } : {}))
const holder = computed(() => holders.value?.find(entry => entry.holderId === holderId.value) ?? null)
const items = computed(() => (holders.value ?? []).map(entry => ({ label: `${entry.holderName}, ${saysMoney(entry.outstandingPence)}`, value: entry.holderId })))

watch(open, async (now) => {
  if (!now) return
  holderId.value = undefined
  charges.value = null
  failure.value = null
  loading.value = true
  try {
    holders.value = (await $fetch<{ holders: Owing[] }>('/api/till/tab-settlements/holders', { query: scope.value })).holders
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    loading.value = false
  }
})

watch(holderId, async (id) => {
  charges.value = null
  failure.value = null
  if (!id) return
  loading.value = true
  try {
    const answered = await $fetch<{ charges: TabCharge[], totalPence: number }>('/api/till/tab-settlements', { query: { ...scope.value, holderId: id } })
    if (holderId.value !== id) return
    charges.value = answered.charges
    totalPence.value = answered.totalPence
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    loading.value = false
  }
})

const says = (charge: TabCharge): string => charge.lines.map(line => `${line.qty}× ${line.variantLabel} ${line.productName}`).join(', ')

async function start(): Promise<void> {
  if (!holderId.value || !charges.value?.length) return
  starting.value = true
  failure.value = null
  try {
    const started = await $fetch<{ id: string | null, totalPence: number }>('/api/till/tab-settlements', {
      method: 'POST',
      body: { ...scope.value, holderId: holderId.value, entryIds: charges.value.map(charge => charge.entryId), expectedTotalPence: totalPence.value },
    })
    open.value = false
    if (started.id) emit('started', { id: started.id, totalPence: started.totalPence })
    else emit('settled')
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    starting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Settle a tab"
    description="The holder pays what they owe on the reader. Nothing is recorded until the reader answers."
  >
    <template #body>
      <div class="space-y-4">
        <p
          v-if="holders && holders.length === 0"
          data-test="settle-nobody-owes"
          class="text-sm text-muted"
        >
          Nobody owes the bar anything.
        </p>
        <UFormField
          v-else
          label="Whose tab"
        >
          <USelect
            v-model="holderId"
            :items="items"
            :loading="loading && !holders"
            placeholder="Pick who is paying"
            class="w-full"
            data-test="settle-holder"
          />
        </UFormField>

        <div
          v-if="holder && charges"
          class="space-y-2"
          data-test="settle-charges"
        >
          <ul class="space-y-1 text-sm">
            <li
              v-for="charge in charges"
              :key="charge.entryId"
              class="flex justify-between gap-2"
            >
              <span>{{ saysDay(charge.happenedAt) }}: {{ says(charge) }}</span>
              <span class="font-mono tabular-nums">{{ saysMoney(charge.totalPence) }}</span>
            </li>
          </ul>
          <p class="text-lg font-semibold">
            {{ holder.holderName }} owes <span
              class="font-mono tabular-nums"
              data-test="settle-total"
            >{{ saysMoney(totalPence) }}</span>
          </p>
        </div>

        <UAlert
          v-if="failure"
          data-test="settle-failure"
          color="error"
          variant="subtle"
          :description="failure"
        />

        <UButton
          block
          class="min-h-12"
          icon="i-lucide-credit-card"
          :loading="starting"
          :disabled="!charges?.length || loading"
          data-test="settle-start"
          @click="start"
        >
          {{ charges?.length ? `Charge ${saysMoney(totalPence)} on the reader` : 'Charge on the reader' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
