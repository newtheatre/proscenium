<script setup lang="ts">
import { londonDay } from '#shared/utils/membership'

// The ticket sales export (D-129), on the shows list for front of house and on Money exports for
// the Treasurer (0171); the route takes either permission.
const today = londonDay(new Date())
const exportFrom = ref(today)
const exportTo = ref(today)

// A GET link, not a fetch: the browser follows the content-disposition header and saves the file itself.
const ticketExportUrl = computed(() => `/api/admin/tickets/export?${new URLSearchParams({ from: exportFrom.value, to: exportTo.value }).toString()}`)
</script>

<template>
  <section
    class="space-y-4"
    data-test="section-ticket-export"
  >
    <h2 class="font-semibold">
      Ticket sales export
    </h2>
    <p class="text-sm text-muted">
      Every ticket for performances between these two days, whatever its state, as a CSV:
      reference, performance, type, price, source, the booking's state (the collected column) and
      whether it was refunded. Unpaid, lapsed and cancelled bookings are included, so filter on the
      collected column for what was sold. No names and no access details are ever in it. Taking a copy is
      recorded in the audit trail.
    </p>
    <AdminToolbar :filterable="false">
      <template #actions>
        <DateField
          v-model="exportFrom"
          data-test="ticket-export-from"
        />
        <DateField
          v-model="exportTo"
          data-test="ticket-export-to"
        />
        <UButton
          data-test="ticket-export-csv"
          icon="i-lucide-download"
          :to="ticketExportUrl"
          external
          target="_blank"
          :disabled="!exportFrom || !exportTo || exportTo < exportFrom"
        >
          Export CSV
        </UButton>
      </template>
    </AdminToolbar>
  </section>
</template>
