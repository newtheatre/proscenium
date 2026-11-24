<!-- One way to pay at the till, once it is chosen: the cash handed over with the change shown as it is
     typed, a note for an "other" payment, the reader where there is more than one, and the button that
     takes the payment (with "declined" beside a standalone card machine's). The till does the paying. -->
<script setup lang="ts">
import { methodIcon, needsReader, type Offer } from '../../shared/till'

const props = defineProps<{
  method: Offer
  /** The way's name, and its provider's where that is not already in the name. */
  label: string
  provider: string | null
  /** What this payment takes. */
  takenMinor: number
  /** The change for what was handed over; null while nothing has been typed. */
  change: number | null
  /** Quick amounts a customer usually hands over, in minor units. */
  quick: number[]
  busy: boolean
  /** The label of the way back to the other ways (or the other people); none when there is nowhere to go back to. */
  back: string | null
  currency: string
  money: (minor: number) => string
}>()
const emit = defineEmits<{ pay: [succeeded: boolean], tender: [minor: number], back: [] }>()
const tendered = defineModel<number | undefined>('tendered')
const note = defineModel<string>('note', { required: true })
const reader = defineModel<string | undefined>('reader')
const { t } = useT()

const short = computed(() => props.change !== null && props.change < 0)
const payLabel = computed(() => {
  const amount = props.money(props.takenMinor)
  switch (props.method.method) {
    case 'other_attested': return t('payments.screens.till.received', { amount })
    case 'card_attested': return t('payments.screens.till.approved', { amount })
    case 'cash': return t('payments.screens.till.cash-taken', { amount })
    default: return t('payments.screens.till.start', { amount })
  }
})
</script>

<template>
  <p class="flex items-center gap-2 font-medium">
    <UIcon
      :name="methodIcon(method)"
      class="size-5"
    />{{ label }}
    <span
      v-if="provider"
      class="text-sm font-normal text-muted"
    >{{ provider }}</span>
  </p>
  <UFormField
    v-if="method.method === 'cash'"
    :label="t('payments.screens.till.tendered')"
    :hint="t('payments.screens.optional')"
    :help="t('payments.screens.till.tendered-help')"
  >
    <div class="space-y-2">
      <FieldNumber
        v-model="tendered"
        :min="0"
        :step="0.01"
        :increment="false"
        :decrement="false"
        :format-options="{ style: 'currency', currency }"
        class="w-36"
      />
      <div
        class="flex flex-wrap gap-2"
        role="group"
        :aria-label="t('payments.screens.till.quick-tender')"
      >
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          :label="t('payments.screens.till.exact')"
          @click="emit('tender', takenMinor)"
        />
        <UButton
          v-for="n in quick"
          :key="n"
          size="sm"
          color="neutral"
          variant="outline"
          :label="money(n)"
          @click="emit('tender', n)"
        />
      </div>
      <!-- Its room is kept while the box is empty, so the button below does not move under
           the seller's finger as the amount handed over is entered. -->
      <p
        class="min-h-8 text-2xl font-semibold tabular-nums"
        :class="short ? 'text-error' : 'text-highlighted'"
        aria-live="polite"
      >
        <template v-if="change !== null">
          {{ change < 0 ? t('payments.screens.till.short', { amount: money(-change) }) : t('payments.screens.till.change-live', { amount: money(change) }) }}
        </template>
      </p>
    </div>
  </UFormField>
  <UFormField
    v-if="method.method === 'other_attested'"
    :label="t('payments.screens.till.other-note')"
    :hint="t('payments.screens.optional')"
    :help="t('payments.screens.till.other-note-help')"
  >
    <UInput
      v-model="note"
      maxlength="200"
      autocomplete="off"
    />
  </UFormField>
  <UFormField
    v-if="needsReader(method)"
    :label="t('payments.screens.test.reader')"
    required
  >
    <USelectMenu
      v-model="reader"
      value-key="value"
      :items="(method.readers ?? []).map(r => ({ value: r.id, label: r.label }))"
    />
  </UFormField>

  <div class="flex flex-wrap gap-2">
    <UButton
      size="lg"
      :loading="busy"
      :disabled="(needsReader(method) && !reader) || (method.method === 'cash' && short)"
      :label="payLabel"
      @click="emit('pay', true)"
    />
    <UButton
      v-if="method.method === 'card_attested'"
      size="lg"
      color="neutral"
      variant="outline"
      :disabled="busy"
      :label="t('payments.screens.till.machine-declined')"
      @click="emit('pay', false)"
    />
  </div>
  <UButton
    v-if="back"
    color="neutral"
    variant="link"
    icon="i-lucide-arrow-left"
    :disabled="busy"
    :label="back"
    @click="emit('back')"
  />
</template>
