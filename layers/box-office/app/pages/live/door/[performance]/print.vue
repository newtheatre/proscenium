<!-- The door list on paper (D2, box office review): the fallback when a device at the door cannot
     check tickets. Every booking for the performance by name, with its reference, its tickets, how
     many were already in when it was printed, whether it is paid for, and boxes to tick people in.
     Printed in black on white whatever the screen's mode. -->
<script setup lang="ts">
import type { PackBooking } from '../../../../composables/useOfflineDoor'

interface Pack { performance: { title: string, label: string | null, startsAt: number, venue: string }, madeAt: number, bookings: PackBooking[] }

const { t } = useT()
const { time, dayNamed } = useDates()
const { money } = await useMoney()
const nameOf = useDoorName()
const route = useRoute()
const id = computed(() => String(route.params.performance))
const { data, status, error, refresh } = await useAPI<Pack>(() => `/api/box-office/performances/${encodeURIComponent(id.value)}/door/offline`, { key: `box-office:door:print:${id.value}` })
const print = () => window.print()
const rows = computed(() => [...(data.value?.bookings ?? [])].sort((a, b) => nameOf(a).localeCompare(nameOf(b)) || a.reference.localeCompare(b.reference)))
const heading = computed(() => data.value ? [data.value.performance.title, data.value.performance.label, `${dayNamed(data.value.performance.startsAt)} ${time(data.value.performance.startsAt)}`, data.value.performance.venue].filter(Boolean).join(' · ') : '')
useHead({ title: () => `${t('box-office.door-print.title')}: ${heading.value}` })
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
        <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 class="text-2xl font-semibold">
              {{ t('box-office.door-print.title') }}
            </h1>
            <p>{{ heading }}</p>
            <p class="text-sm text-muted print:text-black">
              {{ t('box-office.door-print.made', { time: time(d.madeAt) }) }}
            </p>
          </div>
          <div class="flex gap-2 print:hidden">
            <UButton
              :to="`/live/door/${encodeURIComponent(id)}`"
              icon="i-lucide-arrow-left"
              color="neutral"
              variant="outline"
              size="xl"
              :label="t('core.live.back')"
            />
            <UButton
              icon="i-lucide-printer"
              size="xl"
              :label="t('box-office.door-print.print')"
              @click="print"
            />
          </div>
        </div>
        <p
          v-if="!rows.length"
          class="text-muted"
        >
          {{ t('box-office.door-print.empty') }}
        </p>
        <table
          v-else
          class="w-full border-collapse text-sm"
        >
          <thead>
            <tr class="border-b-2 border-default text-start print:border-black">
              <th class="py-2 pe-3 text-start">
                {{ t('box-office.door-print.column.name') }}
              </th>
              <th class="py-2 pe-3 text-start">
                {{ t('box-office.door-print.column.reference') }}
              </th>
              <th class="py-2 pe-3 text-end">
                {{ t('box-office.door-print.column.tickets') }}
              </th>
              <th class="py-2 pe-3 text-end">
                {{ t('box-office.door-print.column.in') }}
              </th>
              <th class="py-2 text-start">
                {{ t('box-office.door-print.column.arrived') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.id"
              class="break-inside-avoid border-b border-default print:border-black"
            >
              <td class="py-2 pe-3">
                {{ nameOf(row) }}
                <span
                  v-if="row.unpaid"
                  class="ms-2 font-semibold"
                >{{ t('box-office.door-print.not-paid', { amount: money(row.unpaid.amountDueMinor, row.unpaid.currency) }) }}</span>
              </td>
              <td class="py-2 pe-3 font-mono">
                {{ row.reference }}
              </td>
              <td class="py-2 pe-3 text-end tabular-nums">
                {{ row.tickets }}
              </td>
              <td class="py-2 pe-3 text-end tabular-nums">
                {{ row.admitted }}
              </td>
              <td
                class="py-2"
                aria-hidden="true"
              >
                <span
                  v-for="n in row.tickets - row.admitted"
                  :key="n"
                  class="me-1 inline-block size-4 border border-current align-middle"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </template>
    </DataBoundary>
  </div>
</template>
