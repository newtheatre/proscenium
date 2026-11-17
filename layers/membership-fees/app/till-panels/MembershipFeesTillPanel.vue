<!-- The fees module's panel in the till (P8): find somebody whose membership waits for its fee, by
     name or email address, and add the fee to the payment. The till adds it up and takes the money;
     the membership starts once it has. -->
<script setup lang="ts">
interface WaitingFee { chargeId: string, membershipId: string, accountName: string | null, schemeName: string, lengthName: string | null, amountMinor: number, currency: string, appliedAt: number, beingPaid: boolean }

const props = defineProps<{ modelValue: unknown, locked: boolean, summary: { lines: { label: string, amountMinor: number }[], amountMinor: number } | null }>()
const emit = defineEmits<{ 'update:modelValue': [unknown] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { day } = useDates()
const { toRefusal } = useRefusal()

const query = ref('')
const fees = ref<WaitingFee[]>([])
const searched = ref(false)
const busy = ref(false)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const chosen = ref<WaitingFee | null>(null)

async function search() {
  busy.value = true
  refusal.value = null
  try {
    fees.value = (await $api<{ fees: WaitingFee[] }>('/api/membership-fees/desk/waiting', { query: { q: query.value } })).fees
    searched.value = true
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}

function choose(fee: WaitingFee | null) {
  chosen.value = fee
  emit('update:modelValue', fee ? { chargeId: fee.chargeId, expectedAmountMinor: fee.amountMinor } : null)
}

// The till empties every panel after a payment: start again with nothing chosen.
watch(() => props.modelValue, (value) => {
  if (value === null && chosen.value) {
    chosen.value = null
    fees.value = []
    searched.value = false
    query.value = ''
  }
})

const what = (fee: WaitingFee) => fee.lengthName ? `${fee.schemeName}, ${fee.lengthName}` : fee.schemeName
</script>

<template>
  <div class="space-y-4">
    <RefusalNotice :refusal="refusal" />

    <div
      v-if="chosen"
      class="space-y-2 rounded-lg border border-default p-4"
    >
      <p class="font-medium">
        {{ chosen.accountName ?? t('membership-fees.desk.no-name') }}
      </p>
      <p class="text-sm">
        {{ what(chosen) }}
      </p>
      <p class="font-medium">
        {{ t('membership-fees.desk.due', { amount: money(chosen.amountMinor) }) }}
      </p>
      <UButton
        :label="t('membership-fees.desk.remove')"
        color="neutral"
        variant="link"
        :disabled="locked"
        @click="choose(null)"
      />
    </div>

    <template v-else>
      <UForm
        class="flex items-end gap-2"
        :state="{ query }"
        @submit="search()"
      >
        <UFormField
          :label="t('membership-fees.desk.search')"
          class="grow"
        >
          <UInput
            v-model="query"
            :disabled="locked"
            autocomplete="off"
          />
        </UFormField>
        <UButton
          type="submit"
          :label="t('membership-fees.desk.find')"
          icon="i-lucide-search"
          :loading="busy"
          :disabled="locked"
        />
      </UForm>

      <p
        v-if="searched && !fees.length"
        class="text-sm text-muted"
      >
        {{ t('membership-fees.desk.none') }}
      </p>
      <RecordList v-else-if="fees.length">
        <RecordListItem
          v-for="fee in fees"
          :key="fee.chargeId"
          :name="fee.accountName ?? t('membership-fees.desk.no-name')"
          :description="[t('membership-fees.desk.row', { what: what(fee), amount: money(fee.amountMinor), applied: day(fee.appliedAt) }), fee.beingPaid ? t('membership-fees.desk.being-paid') : null].filter(Boolean).join(' · ')"
        >
          <UButton
            :label="t('membership-fees.desk.add')"
            :disabled="locked || fee.beingPaid"
            @click="choose(fee)"
          />
        </RecordListItem>
      </RecordList>
    </template>
  </div>
</template>
