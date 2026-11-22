<!-- One night on My tickets: the show, when and where, said once, then each booking held for that
     performance: its reference and how it stands, and, for one still to come that is paid for, each
     ticket's code to hold up at the door. A reservation says what is still to pay at the box office
     instead. Manage opens the booking's own page, to see it in full or cancel what the theatre allows. -->
<script setup lang="ts">
import type { MyNight, MyVisit } from '../utils/my-bookings'

defineProps<{ night: MyNight, past?: boolean }>()
const { t } = useT()
const { dateTime } = useDates()
const { money } = await useMoney()
const headingId = useId()
const TONE = { reserved: 'warning', awaiting_payment: 'warning', confirmed: 'success' } as const
const coded = (visit: MyVisit) => visit.tickets.filter(x => x.doorCode)
// Tickets of one kind are counted together in the summary line.
function summary(visit: MyVisit) {
  const counts = new Map<string, number>()
  for (const x of visit.tickets) counts.set(x.label, (counts.get(x.label) ?? 0) + 1)
  return [...counts].map(([label, count]) => ticketsLine(t, count, label)).join(', ')
}
</script>

<template>
  <UCard
    as="article"
    :aria-labelledby="headingId"
    :ui="{ body: 'divide-y divide-default p-0 sm:p-0' }"
  >
    <template #header>
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0 space-y-1">
          <h3
            :id="headingId"
            class="text-lg font-semibold text-highlighted"
          >
            {{ night.production.title }}
          </h3>
          <p class="text-sm text-muted">
            {{ t('box-office.book.when', { when: dateTime(night.performance.startsAt), venue: night.performance.venue }) }}
          </p>
        </div>
        <StatusBadge
          v-if="night.performance.state === 'cancelled'"
          tone="danger"
          :label="t('box-office.mine.performance-cancelled')"
        />
      </div>
    </template>
    <section
      v-for="visit in night.bookings"
      :key="visit.orderId"
      class="space-y-4 p-4 sm:p-6"
      :aria-label="t('box-office.basket.reference', { reference: visit.reference })"
    >
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0 space-y-1">
          <p class="text-sm font-medium text-highlighted">
            {{ summary(visit) }}
          </p>
          <p class="text-sm text-muted">
            {{ t('box-office.basket.reference', { reference: visit.reference }) }}
          </p>
        </div>
        <StatusBadge
          v-if="!past && night.performance.state !== 'cancelled'"
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
          v-if="coded(visit).length"
          class="grid grid-cols-1 gap-4 sm:grid-cols-2"
          :aria-label="t('box-office.mine.tickets-for', { show: night.production.title })"
        >
          <li
            v-for="(ticket, i) in coded(visit)"
            :key="ticket.lineId"
            class="flex flex-col items-center gap-2 text-center"
          >
            <QrCode
              :value="ticket.doorCode!"
              :label="t(ticket.label ? 'box-office.mine.ticket-code' : 'box-office.mine.ticket-code-plain', { n: i + 1, count: coded(visit).length, label: ticket.label })"
            />
            <span class="text-sm">{{ t(ticket.label ? 'box-office.mine.ticket' : 'box-office.mine.ticket-plain', { n: i + 1, count: coded(visit).length, label: ticket.label }) }}</span>
            <StatusBadge
              v-if="ticket.admitted"
              tone="neutral"
              :label="t('box-office.mine.admitted')"
            />
          </li>
        </ul>
        <p
          v-if="coded(visit).length < visit.tickets.length"
          class="text-sm text-muted"
        >
          {{ t('box-office.mine.codes-in-email') }}
        </p>
      </template>
      <UButton
        :to="{ path: '/book/order/mine', query: { order: visit.orderId } }"
        variant="outline"
        color="neutral"
        icon="i-lucide-settings-2"
        :label="t('box-office.mine.manage')"
        :aria-label="t('box-office.mine.manage-label', { show: night.production.title, reference: visit.reference })"
      />
    </section>
  </UCard>
</template>
