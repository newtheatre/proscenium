<!-- The people sharing a split till sale (Matt, 18 November 2026): each with the items given to them,
     their amount, a box for who their own receipt (and any tickets) goes to, and the ways to pay their share. Someone who
     has paid shows a tick instead. The till does the paying; this only draws the people. -->
<script setup lang="ts" generic="Method extends { providerAccountId: string, method: string }">
import type { ReceiptTo } from './PaymentsReceiptTo.vue'

interface Person { position: number, amountMinor: number, items: { label: string, quantity: number, amountMinor: number }[], paid: boolean }

const props = defineProps<{
  persons: Person[]
  methods: Method[]
  methodLabel: (m: Method) => string
  methodIcon: (m: Method) => string
  money: (minor: number) => string
  /** Something is under way, so nobody else can start paying. */
  busy: boolean
  /** The person being paid for now. */
  paying: number | null
}>()
const emit = defineEmits<{ pay: [position: number, method: Method] }>()
const receiptTo = defineModel<Record<number, ReceiptTo | undefined>>('receiptTo', { required: true })
const { t } = useT()

function set(position: number, value: ReceiptTo | undefined) {
  receiptTo.value = { ...receiptTo.value, [position]: value }
}
const pay = (position: number, m: Method) => emit('pay', position, m)
const keyOf = (m: Method) => `${m.providerAccountId}:${m.method}`
const items = (p: Person) => p.items.map(i => (i.quantity > 1 ? t('payments.screens.till.person-item', { n: i.quantity, item: i.label }) : i.label)).join(', ')
</script>

<template>
  <ul class="space-y-2">
    <li
      v-for="p in props.persons"
      :key="p.position"
      class="space-y-2 rounded-md border border-default p-3"
      :class="p.paid ? 'bg-elevated/50' : undefined"
    >
      <p class="flex items-baseline justify-between gap-2">
        <span class="flex items-center gap-2 font-medium">
          {{ t('payments.screens.till.person', { n: p.position }) }}
          <UBadge
            v-if="p.paid"
            color="success"
            variant="subtle"
            icon="i-lucide-check"
            :label="t('payments.screens.till.person-paid')"
          />
        </span>
        <span class="font-semibold tabular-nums">{{ props.money(p.amountMinor) }}</span>
      </p>
      <p class="text-sm text-muted">
        {{ p.items.length ? items(p) : t('payments.screens.till.person-nothing') }}
      </p>
      <template v-if="!p.paid">
        <UFormField
          :label="t('payments.screens.till.receipt-to')"
          :hint="t('payments.screens.optional')"
        >
          <PaymentsReceiptTo
            :model-value="receiptTo[p.position]"
            :disabled="props.busy && props.paying === p.position"
            @update:model-value="set(p.position, $event)"
          />
        </UFormField>
        <div
          role="group"
          :aria-label="t('payments.screens.till.person-how', { n: p.position })"
          class="flex flex-wrap gap-2"
        >
          <UButton
            v-for="m in props.methods"
            :key="keyOf(m)"
            size="md"
            color="neutral"
            variant="outline"
            :icon="props.methodIcon(m)"
            :loading="props.busy && props.paying === p.position"
            :disabled="props.busy || p.amountMinor <= 0"
            :label="props.methodLabel(m)"
            @click="pay(p.position, m)"
          />
        </div>
      </template>
    </li>
  </ul>
</template>
