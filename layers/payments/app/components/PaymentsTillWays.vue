<!-- The ways to pay on the till's receipt before anything is taken, one press each: the first (card,
     nearly always) large, the others and Split beside it, and any panel's other ways to finish, such as
     reserving to pay later. With no way to pay known yet, one button takes payment and says why. -->
<script setup lang="ts">
import { methodIcon, methodKey, type Offer, type PanelAction } from '../../shared/till'

defineProps<{
  methods: Offer[]
  methodLabel: (m: Offer) => string
  totalMinor: number
  /** The server has agreed the total, and anything the sale needs is given. */
  payable: boolean
  busy: boolean
  /** One item cannot be split. */
  canSplit: boolean
  actions: PanelAction[]
  /** The total is being asked for again, so a panel's own way to finish waits. */
  pricing: boolean
  money: (minor: number) => string
}>()
const emit = defineEmits<{ pay: [method: Offer], take: [], split: [] }>()
const { t } = useT()
</script>

<template>
  <template v-if="methods.length">
    <UButton
      block
      size="xl"
      class="justify-center py-3"
      :icon="methodIcon(methods[0]!)"
      :loading="busy"
      :disabled="!payable"
      :label="t('payments.screens.till.pay-by', { method: methodLabel(methods[0]!), amount: money(totalMinor) })"
      @click="emit('pay', methods[0]!)"
    />
    <div class="grid grid-cols-2 gap-2">
      <UTooltip
        v-for="m in methods.slice(1)"
        :key="methodKey(m)"
        :text="m.label"
      >
        <UButton
          block
          size="lg"
          color="neutral"
          variant="outline"
          :icon="methodIcon(m)"
          :disabled="!payable || busy"
          :label="methodLabel(m)"
          @click="emit('pay', m)"
        />
      </UTooltip>
      <!-- One item cannot be split, so the button says why it is off. -->
      <UTooltip
        :text="t('payments.screens.till.split-one')"
        :disabled="canSplit"
      >
        <UButton
          block
          size="lg"
          color="neutral"
          variant="outline"
          icon="i-lucide-split"
          :class="methods.length % 2 ? 'col-span-2' : undefined"
          :disabled="!payable || busy || !canSplit"
          :label="t('payments.screens.till.split')"
          @click="emit('split')"
        />
      </UTooltip>
    </div>
  </template>
  <UButton
    v-else
    block
    size="lg"
    icon="i-lucide-banknote"
    :loading="busy"
    :disabled="!payable"
    :label="t('payments.screens.till.take', { amount: money(totalMinor) })"
    @click="emit('take')"
  />
  <UButton
    v-for="a in actions"
    :key="a.key"
    block
    size="lg"
    color="neutral"
    variant="outline"
    :icon="a.icon"
    :loading="a.loading"
    :disabled="busy || pricing"
    :label="a.label"
    @click="a.run"
  />
</template>
