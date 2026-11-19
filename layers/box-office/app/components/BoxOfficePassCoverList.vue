<!-- Tickets a pass could cover (Matt, 19 November): tickets the holder already has for other shows
     the pass covers, each ticked to begin with, one a performance and, for a pass that gives one
     performance of each show, one a show. Others for those shows stay as they are and are counted
     below. Used online beside the swap, on the holder's passes page, by staff and at the till. -->
<script setup lang="ts">
export interface CoverChoice { lineId: string, orderId: string, reference: string, show: string, startsAt: number, ticket: string, amountMinor: number, paid: boolean }

const props = defineProps<{ choices: CoverChoice[], others: number, currency?: string, disabled?: boolean, /** Staff see the booking reference; the holder sees their own words. */ staff?: boolean }>()
const ticked = defineModel<string[]>({ default: () => [] })

const { t } = useT()
const { money } = await useMoney()
const { dateTime } = useDates()

function toggle(lineId: string, on: boolean | 'indeterminate') {
  ticked.value = on === true ? [...new Set([...ticked.value, lineId])] : ticked.value.filter(id => id !== lineId)
}
const describe = (c: CoverChoice) => [
  props.staff ? t('box-office.covers.booking', { reference: c.reference, ticket: c.ticket }) : c.ticket,
  t('box-office.covers.reserved', { amount: money(c.amountMinor, props.currency) }),
].join(' · ')
</script>

<template>
  <div class="space-y-2">
    <UCheckbox
      v-for="c in choices"
      :key="c.lineId"
      :model-value="ticked.includes(c.lineId)"
      :label="t('box-office.covers.show', { show: c.show, when: dateTime(c.startsAt) })"
      :description="describe(c)"
      :disabled="disabled"
      @update:model-value="toggle(c.lineId, $event)"
    />
    <p
      v-if="others"
      class="text-sm text-muted"
    >
      {{ t('box-office.covers.others', { count: others }) }}
    </p>
  </div>
</template>
