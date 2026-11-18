<!-- A paid booking's tickets on paper (T3, after the sale at the till): one ticket to a block, each
     with the show, its time and place, the seats and kind of ticket, who it is for when it was
     named, the QR code the door scans and the number a person reads. Opened from the till once the
     sale is paid; drawn in the plain live layout and printed in black on white whatever the
     screen's mode, a ticket never split across two pages. -->
<script setup lang="ts">
definePageMeta({ layout: 'live' })

interface Printed { reference: string, tickets: { lineId: string, number: string, production: string, startsAt: number, venue: string, band: string | null, ticketType: string, holder: string | null, doorCode: string | null, admitted: boolean }[] }

const { t } = useT()
const { time, dayNamed } = useDates()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<Printed>(() => `/api/box-office/desk/orders/${encodeURIComponent(id.value)}/tickets`, { key: `box-office:print-tickets:${id.value}` })
const print = () => window.print()
const when = (at: number) => `${dayNamed(at)} ${time(at)}`
useHead({ title: () => t('box-office.print-tickets.title', { reference: data.value?.reference ?? '' }) })
</script>

<template>
  <div class="flex-1 p-4 sm:p-6 print:bg-white print:p-0 print:text-black">
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <div class="mb-4 flex flex-wrap items-start justify-between gap-3 print:hidden">
          <div>
            <h1 class="text-2xl font-semibold">
              {{ t('box-office.print-tickets.title', { reference: d.reference }) }}
            </h1>
            <p class="text-sm text-muted">
              {{ t('box-office.print-tickets.help', { count: d.tickets.length }) }}
            </p>
          </div>
          <div class="flex gap-2">
            <UButton
              :to="`/console/box-office/orders/${encodeURIComponent(id)}`"
              icon="i-lucide-receipt"
              color="neutral"
              variant="outline"
              size="xl"
              :label="t('box-office.print-tickets.booking')"
            />
            <UButton
              icon="i-lucide-printer"
              size="xl"
              :label="t('box-office.print-tickets.print')"
              @click="print"
            />
          </div>
        </div>
        <ul
          class="grid gap-4 sm:grid-cols-2 print:block"
          :aria-label="t('box-office.print-tickets.list')"
        >
          <li
            v-for="(ticket, i) in d.tickets"
            :key="ticket.lineId"
            class="flex break-inside-avoid flex-col gap-3 rounded-lg border border-default p-4 sm:flex-row print:mb-4 print:rounded-none print:border-black"
          >
            <div class="min-w-0 flex-1 space-y-1">
              <p class="text-sm text-muted print:text-black">
                {{ t('box-office.booking.tickets.which', { n: i + 1, of: d.tickets.length }) }}
              </p>
              <h2 class="text-lg font-semibold">
                {{ ticket.production }}
              </h2>
              <p>{{ when(ticket.startsAt) }}</p>
              <p>{{ ticket.venue }}</p>
              <p class="font-medium">
                {{ ticket.band ? t('box-office.print-tickets.seats', { band: ticket.band, type: ticket.ticketType }) : ticket.ticketType }}
              </p>
              <p v-if="ticket.holder">
                {{ t('box-office.print-tickets.holder', { name: ticket.holder }) }}
              </p>
              <p class="font-mono text-sm">
                {{ t('box-office.print-tickets.reference', { reference: d.reference }) }}
              </p>
              <p
                v-if="ticket.admitted"
                class="text-sm font-semibold"
              >
                {{ t('box-office.booking.tickets.admitted') }}
              </p>
            </div>
            <div class="flex flex-col items-center gap-1">
              <QrCode
                v-if="ticket.doorCode"
                :value="ticket.doorCode"
                :label="t('box-office.print-tickets.code', { number: ticket.number })"
                class="w-40"
              />
              <p
                v-else
                class="max-w-40 text-sm"
              >
                {{ t('box-office.print-tickets.no-code') }}
              </p>
              <p class="font-mono text-sm tracking-wide">
                {{ ticket.number }}
              </p>
            </div>
          </li>
        </ul>
      </template>
    </DataBoundary>
  </div>
</template>
