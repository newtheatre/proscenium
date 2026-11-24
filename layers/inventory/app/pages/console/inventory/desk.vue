<!-- The kit desk (S6, wireframe 3; INV-22, INV-23): scan a loan, a label or a tag; tick what goes out
     or comes back. Going out asks who is collecting and checks what the kit needs of them; only a
     holder of the override can let it go to someone who does not meet it, choosing why (K4). -->
<script setup lang="ts">
import { OVERRIDE_REASONS } from '../../../../shared/states'

definePageMeta({ layout: 'live' })

const { t } = useT()
const { range } = useDates()
const { mode, code, loan, collector, overrideReason, choices, refusal, busy, waiting, ticked, unmet, scan, send } = useKitDesk()
const modes = computed(() => [{ value: 'out', label: t('inventory.desk.mode.out') }, { value: 'back', label: t('inventory.desk.mode.back') }])
const reasonItems = computed(() => OVERRIDE_REASONS.map(r => ({ value: r, label: t(`inventory.desk.override-reasons.${r}`) })))
const blocked = computed(() => unmet.value.length > 0 && !overrideReason.value)
const action = computed(() => t(mode.value === 'out' ? 'inventory.desk.check-out' : 'inventory.desk.take-back', { count: ticked.value.length }))
</script>

<template>
  <PageLive
    :title="t('inventory.desk.title')"
    :context="loan?.borrower"
    back="/console/inventory/loans"
  >
    <div class="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      <URadioGroup
        v-model="mode"
        :items="modes"
        orientation="horizontal"
        variant="table"
        :legend="t('inventory.desk.mode.label')"
      />
      <UForm
        class="flex items-end gap-2"
        :state="{ code }"
        novalidate
        @submit="scan"
      >
        <UFormField
          name="code"
          :label="t('inventory.desk.scan')"
          class="flex-1"
        >
          <UInput
            v-model="code"
            autofocus
            icon="i-lucide-scan-barcode"
            autocomplete="off"
            maxlength="300"
          />
        </UFormField>
        <UButton
          type="submit"
          color="neutral"
          variant="outline"
          :label="t('inventory.desk.find')"
        />
      </UForm>
      <RefusalNotice :refusal="refusal" />
      <EmptyState
        v-if="!loan"
        icon="i-lucide-scan-barcode"
        :title="t('inventory.desk.empty')"
        :description="t('inventory.desk.empty-help')"
      />
      <template v-else>
        <p class="text-sm text-muted">
          {{ [loan.department, range(loan.startsAt, loan.dueBackOn), t(`inventory.loan-states.${loan.state}`)].join(' · ') }}
        </p>
        <UAlert
          v-if="mode === 'out' && loan.startsLater"
          color="warning"
          variant="subtle"
          :title="t('inventory.desk.starts-later')"
        />
        <UFormField
          v-if="mode === 'out'"
          :label="t('inventory.desk.collector')"
          :help="loan.responsible ? t('inventory.desk.collector-help', { name: loan.responsible.name }) : undefined"
        >
          <PersonPicker
            v-model="collector"
            endpoint="/api/inventory/loans/borrowers"
          />
        </UFormField>
        <EmptyState
          v-if="!waiting.length"
          icon="i-lucide-check"
          :title="t(mode === 'out' ? 'inventory.desk.nothing-to-go' : 'inventory.desk.nothing-out')"
        />
        <ul
          v-else
          class="divide-y divide-default"
          :aria-label="t('inventory.loan.lines')"
        >
          <InventoryDeskLine
            v-for="line in waiting"
            :key="line.id"
            v-model="choices[line.id]!"
            :line="line"
            :mode="mode"
          />
        </ul>
        <UAlert
          v-if="unmet.length"
          color="warning"
          variant="subtle"
          :title="t('inventory.desk.unmet', { count: unmet.length })"
          :description="loan.canOverride ? t('inventory.desk.override-help') : t('inventory.desk.no-override')"
        />
        <UFormField
          v-if="unmet.length && loan.canOverride"
          :label="t('inventory.desk.override-reason')"
        >
          <USelect
            v-model="overrideReason"
            :items="reasonItems"
            :placeholder="t('inventory.desk.override-choose')"
          />
        </UFormField>
        <div class="flex justify-end">
          <UButton
            :label="action"
            :loading="busy"
            :disabled="!ticked.length || blocked"
            size="lg"
            @click="send"
          />
        </div>
      </template>
    </div>
  </PageLive>
</template>
