<!-- One visit on My tickets: the show, when and where, the booking reference and how it stands, and,
     for a visit still to come that is paid for, each ticket's code to hold up at the door. A
     reservation says what is still to pay at the box office instead. -->
<script setup lang="ts">
import type { MyVisit } from '../utils/my-bookings'

const props = defineProps<{ visit: MyVisit, past?: boolean }>()
const { t } = useT()
const { dateTime } = useDates()
const { money } = await useMoney()
const headingId = useId()
const TONE = { reserved: 'warning', awaiting_payment: 'warning', confirmed: 'success' } as const
const coded = computed(() => props.visit.tickets.filter(x => x.doorCode))
// Tickets of one kind are counted together in the summary line.
const summary = computed(() => {
  const counts = new Map<string, number>()
  for (const x of props.visit.tickets) counts.set(x.label, (counts.get(x.label) ?? 0) + 1)
  return [...counts].map(([label, count]) => t('box-office.basket.line', { count, label })).join(', ')
})
</script>

<template>
  <UCard
    as="article"
    :aria-labelledby="headingId"
  >
    <div class="space-y-4">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0 space-y-1">
          <h3
            :id="headingId"
            class="text-lg font-semibold text-highlighted"
          >
            {{ visit.production.title }}
          </h3>
          <p class="text-sm text-muted">
            {{ t('box-office.book.when', { when: dateTime(visit.performance.startsAt), venue: visit.performance.venue }) }}
          </p>
          <p class="text-sm">
            {{ summary }}
          </p>
          <p class="text-sm text-muted">
            {{ t('box-office.basket.reference', { reference: visit.reference }) }}
          </p>
        </div>
        <StatusBadge
          v-if="visit.performance.state === 'cancelled'"
          tone="danger"
          :label="t('box-office.mine.performance-cancelled')"
        />
        <StatusBadge
          v-else-if="!past"
          :tone="TONE[visit.state]"
          :label="t(`box-office.manage.state.${visit.state}`)"
        />
      </div>
      <p
        v-if="!past && visit.state !== 'confirmed' && visit.amountDueMinor"
        class="text-sm"
      >
        {{ t('box-office.mine.to-pay', { amount: money(visit.amountDueMinor, visit.currency) }) }}
      </p>
      <template v-if="!past && visit.state === 'confirmed'">
        <ul
          v-if="coded.length"
          class="grid grid-cols-1 gap-4 sm:grid-cols-2"
          :aria-label="t('box-office.mine.tickets-for', { show: visit.production.title })"
        >
          <li
            v-for="(ticket, i) in coded"
            :key="ticket.lineId"
            class="flex flex-col items-center gap-2 text-center"
          >
            <QrCode
              :value="ticket.doorCode!"
              :label="t('box-office.mine.ticket-code', { n: i + 1, count: coded.length, label: ticket.label })"
            />
            <span class="text-sm">{{ t('box-office.mine.ticket', { n: i + 1, count: coded.length, label: ticket.label }) }}</span>
            <StatusBadge
              v-if="ticket.admitted"
              tone="neutral"
              :label="t('box-office.mine.admitted')"
            />
          </li>
        </ul>
        <p
          v-if="coded.length < visit.tickets.length"
          class="text-sm text-muted"
        >
          {{ t('box-office.mine.codes-in-email') }}
        </p>
      </template>
    </div>
  </UCard>
</template>
