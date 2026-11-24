<!-- How much to give: the theatre's amount buttons, none chosen at first, and Other for an amount
     typed within the limits, which are stated beside it (D1). -->
<script setup lang="ts">
import type { GiveOptions } from '../composables/useGive'

const props = defineProps<{ options: GiveOptions }>()
const model = defineModel<number | null>({ required: true })
const other = defineModel<boolean>('other', { required: true })
const emit = defineEmits<{ choose: [amount: number | null] }>()
const { t } = useT()
const { money } = useMoneyText()
const limits = computed(() => t('fundraising.give.limits', { min: money(props.options.minMinor, props.options.currency), max: money(props.options.maxMinor, props.options.currency) }))
</script>

<template>
  <UFormField
    name="amountMinor"
    :label="t('fundraising.give.amount')"
    required
  >
    <div class="flex flex-wrap gap-2">
      <UButton
        v-for="p in options.presets"
        :key="p"
        :label="money(p, options.currency)"
        size="lg"
        :variant="!other && model === p ? 'solid' : 'outline'"
        :color="!other && model === p ? 'primary' : 'neutral'"
        :aria-pressed="!other && model === p"
        @click="emit('choose', p)"
      />
      <UButton
        :label="t('fundraising.give.other')"
        size="lg"
        :variant="other ? 'solid' : 'outline'"
        :color="other ? 'primary' : 'neutral'"
        :aria-pressed="other"
        @click="emit('choose', null)"
      />
    </div>
    <div
      v-if="other"
      class="mt-3 flex flex-wrap items-center gap-3"
    >
      <FieldMoney
        v-model="model"
        :currency="options.currency"
        :min="options.minMinor"
        :max="options.maxMinor"
        :aria-label="t('fundraising.give.other-amount')"
      />
      <span class="text-sm text-muted">{{ limits }}</span>
    </div>
  </UFormField>
</template>
