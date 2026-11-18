<!-- A booking, leading with what it is for: the production, when, where (with the venue's page and
     "Add to calendar"), the tickets and the total, then what to show. A confirmed booking shows each
     ticket's code to be scanned at the door; a reservation shows the box office code, which finds it
     at the desk to be paid for. Used on Your booking, the confirmation screen and after booking. -->
<script setup lang="ts">
import type { BookingView } from '../utils/booking'

const props = defineProps<{
  booking: BookingView
  /** A reservation's box office code, where the screen has just been given it. Otherwise the reference is shown to be scanned, which the desk finds as well. */
  deskCode?: string | null
}>()
const { t } = useT()
const { dateTime } = useDates()
const { money } = await useMoney()

const show = computed(() => props.booking.show ?? null)
const lines = computed(() => groupedBookingLines(props.booking.lines))
const free = computed(() => props.booking.state === 'confirmed' && props.booking.totalMinor === 0)
const reserved = computed(() => props.booking.state === 'reserved' || props.booking.state === 'awaiting_payment')
const tickets = computed(() => props.booking.state === 'confirmed' ? props.booking.tickets ?? [] : [])
const price = (amountMinor: number) => amountMinor === 0 ? t('box-office.manage.free-price') : money(amountMinor, props.booking.currency)
const badge = computed(() => free.value ? t('box-office.manage.state.free') : t(`box-office.manage.state.${props.booking.state}`))

function addToCalendar() {
  if (!show.value) return
  const when = dateTime(show.value.startsAt)
  const description = t('box-office.booking.calendar-description', { reference: props.booking.reference, when })
  const file = bookingCalendar(show.value, props.booking.reference, window.location.href, description)
  const url = URL.createObjectURL(new Blob([file], { type: 'text/calendar;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.booking.reference}.ics`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000) // not-policy: long enough for the download to start
}
</script>

<template>
  <div class="space-y-6">
    <section
      v-if="show"
      class="space-y-1"
    >
      <h2 class="text-xl font-semibold text-highlighted [overflow-wrap:anywhere]">
        {{ show.title }}
      </h2>
      <p class="text-lg">
        {{ dateTime(show.startsAt) }}
      </p>
      <p class="text-muted">
        {{ show.venue }}<template v-if="show.address">
          <br>{{ show.address }}
        </template>
      </p>
      <UAlert
        v-if="show.cancelled"
        color="warning"
        variant="subtle"
        icon="i-lucide-calendar-x"
        :title="t('box-office.booking.cancelled')"
      />
      <div
        v-else
        class="flex flex-wrap gap-2 pt-2"
      >
        <UButton
          variant="outline"
          color="neutral"
          icon="i-lucide-calendar-plus"
          :label="t('box-office.booking.add-to-calendar')"
          @click="addToCalendar"
        />
        <UButton
          v-if="show.venueSlug"
          :to="`/venues/${show.venueSlug}`"
          variant="ghost"
          color="neutral"
          icon="i-lucide-map-pin"
          :label="t('box-office.booking.venue')"
        />
      </div>
    </section>

    <section class="space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <p class="text-lg">
          {{ t('box-office.basket.reference', { reference: booking.reference }) }}
        </p>
        <UBadge
          color="neutral"
          variant="subtle"
          :label="badge"
        />
      </div>
      <ul
        v-if="lines.length"
        class="divide-y divide-default"
      >
        <li
          v-for="line in lines"
          :key="line.label"
          class="flex justify-between gap-4 py-2"
        >
          <span>{{ t('box-office.basket.line', { count: line.count, label: line.label }) }}</span>
          <span>{{ price(line.amountMinor) }}</span>
        </li>
        <li class="flex justify-between gap-4 py-2 font-semibold">
          <span>{{ t('box-office.basket.total') }}</span>
          <span>{{ price(booking.totalMinor) }}</span>
        </li>
      </ul>
      <p
        v-if="booking.amountDueMinor > 0"
        class="font-semibold"
      >
        {{ t('box-office.manage.due', { amount: money(booking.amountDueMinor, booking.currency) }) }}
      </p>
    </section>

    <section
      v-if="reserved && booking.lines.length"
      class="space-y-3"
    >
      <h2 class="text-lg font-semibold">
        {{ t('box-office.booking.desk.title') }}
      </h2>
      <p
        v-if="deskCode"
        class="text-lg"
      >
        {{ t('box-office.basket.desk-code', { code: deskCode }) }}
      </p>
      <BoxOfficeTicketCode
        class="max-w-sm"
        :value="deskCode || booking.reference"
        :title="t(deskCode ? 'box-office.basket.desk-code-qr' : 'box-office.booking.desk.reference-qr')"
        :number="deskCode || booking.reference"
      />
      <p class="text-sm text-muted">
        {{ t('box-office.basket.done.reserved.note') }}
      </p>
    </section>

    <section
      v-if="tickets.length"
      class="space-y-3"
    >
      <h2 class="text-lg font-semibold">
        {{ t('box-office.booking.tickets.title') }}
      </h2>
      <p class="text-sm text-muted">
        {{ t('box-office.booking.tickets.help') }}
      </p>
      <ul class="grid gap-4 sm:grid-cols-2">
        <li
          v-for="(ticket, i) in tickets"
          :key="ticket.lineId"
        >
          <BoxOfficeTicketCode
            :value="ticket.doorCode"
            :title="t('box-office.booking.tickets.which', { n: i + 1, of: tickets.length })"
            :number="ticket.number"
            :note="ticket.admitted ? t('box-office.booking.tickets.admitted') : undefined"
          />
        </li>
      </ul>
    </section>
  </div>
</template>
