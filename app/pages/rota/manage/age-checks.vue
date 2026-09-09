<script setup lang="ts">
definePageMeta({ layout: 'console', title: 'Age-check register', middleware: 'console' })

const today = new Date().toISOString().slice(0, 10)
const from = ref(today)
const to = ref(today)

// The export carries the filter rather than the page, so what is saved is what was asked for.
function exportUrl(format: 'csv' | 'pdf'): string {
  const query = new URLSearchParams({ from: from.value, to: to.value, format })
  return `/api/admin/age-checks/export?${query.toString()}`
}

const refusal = computed(() => (from.value && to.value && from.value <= to.value ? null : 'Pick a range that starts before it ends'))
</script>

<template>
  <div class="space-y-6">
    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-file-down"
      title="The licensing register"
      description="Every Challenge 25 check in the range, including superseded entries with their corrections, as a CSV or a formatted PDF for an inspection."
    />

    <UCard data-test="export-panel">
      <div class="flex flex-wrap items-end gap-4">
        <UFormField label="From">
          <DateField
            v-model="from"
            data-test="export-from"
          />
        </UFormField>

        <UFormField label="To">
          <DateField
            v-model="to"
            data-test="export-to"
          />
        </UFormField>

        <UButton
          data-test="export-csv"
          icon="i-lucide-download"
          color="neutral"
          variant="outline"
          :disabled="refusal !== null"
          :to="refusal ? undefined : exportUrl('csv')"
          external
        >
          Export CSV
        </UButton>

        <UButton
          data-test="export-pdf"
          icon="i-lucide-download"
          color="neutral"
          variant="outline"
          :disabled="refusal !== null"
          :to="refusal ? undefined : exportUrl('pdf')"
          external
        >
          Export PDF
        </UButton>
      </div>

      <UAlert
        v-if="refusal"
        class="mt-4"
        color="warning"
        variant="subtle"
        data-test="export-refusal"
        :description="refusal"
      />
    </UCard>
  </div>
</template>
