<!-- The question a report answers: which production (or season, or venue), which dates and how it is
     broken down. Every change is made in the address, so a link reproduces the view. -->
<script setup lang="ts">
import { PERIOD_RULES, type PeriodRule, type ReportView } from '../../shared/reports'

const props = defineProps<{ view: ReportView }>()
const scopeId = defineModel<string | null>('scopeId', { required: true })
const period = defineModel<PeriodRule>('period', { required: true })
const dates = defineModel<{ start: string, end: string }>('dates', { required: true })
const by = defineModel<string>('by', { required: true })

const { t } = useT()
const { keyName } = useReportWords()
const scoped = computed(() => props.view.scopeKind !== 'none')
// "All of it" means the scope's own dates, so it is offered only where there is a scope.
const periods = computed(() => PERIOD_RULES.filter(r => r !== 'scope' || scoped.value).map(r => ({ value: r, label: t(`reports.periods.${r}`) })))
const breakdowns = computed(() => [{ value: 'none', label: t('reports.by.none') }, ...props.view.breakdowns.map(k => ({ value: k, label: keyName(k, props.view.keyLabels) }))])
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <UFormField
      v-if="scoped"
      :label="t(`reports.scopes.${view.scopeKind}`)"
    >
      <FieldRecord
        v-model="scopeId"
        :record="`core.${view.scopeKind}`"
      />
    </UFormField>
    <UFormField :label="t('reports.period')">
      <USelect
        v-model="period"
        :items="periods"
      />
    </UFormField>
    <UFormField
      v-if="period === 'chosen'"
      :label="t('reports.dates')"
    >
      <FieldDateRange v-model="dates" />
    </UFormField>
    <UFormField :label="t('reports.breakdown')">
      <USelect
        v-model="by"
        :items="breakdowns"
      />
    </UFormField>
  </div>
</template>
