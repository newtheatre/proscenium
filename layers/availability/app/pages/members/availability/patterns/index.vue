<!-- Weekly patterns (S2): the person's patterns, newest first, each with its dates and a line on its
     week; a new one, copying an earlier one's times; removing one. -->
<script setup lang="ts">
import type { PatternRow } from '../../../../composables/usePatterns'

const { t } = useT()
const dates = useDates()
const { $api } = useNuxtApp()
const toast = useToast()
const { toRefusal, phrase } = useRefusal()
const { confirm } = useConfirm()
const { data, status, error, refresh } = await usePatterns()
const adding = ref(false)

function covers(p: PatternRow): string {
  return p.endsOn ? dates.range(p.startsOn, p.endsOn) : t('availability.patterns.from', { date: dates.day(p.startsOn) })
}
function summary(p: PatternRow): string {
  if (!p.lines.length) return t('availability.patterns.nothing-marked')
  const days = [...new Set(p.lines.map(l => l.weekday))].sort().map(w => t(`availability.weekdays.short.${w}`))
  return t('availability.patterns.marked-on', { days: days.join(', ') })
}

async function opened(id: string) {
  await refresh()
  await navigateTo(`/members/availability/patterns/${id}`)
}

async function remove(p: PatternRow) {
  if (!await confirm({ verb: t('availability.patterns.remove'), thing: t('availability.patterns.remove-thing', { label: p.label }), consequence: t('availability.patterns.remove-help') })) return
  try {
    await $api(`/api/availability/patterns/${p.id}`, { method: 'DELETE', body: {} })
    toast.add({ title: t('availability.patterns.removed'), color: 'success' })
    await refresh()
  }
  catch (e) {
    const refusal = toRefusal(e)
    toast.add({ title: phrase(refusal.reason) ?? t('availability.mine.failed'), color: 'error' })
  }
}
</script>

<template>
  <PageFrame
    :title="t('availability.patterns.title')"
    :description="t('availability.patterns.description')"
    width="reading"
    :trail="[{ label: t('availability.mine.title'), to: '/members/availability' }]"
  >
    <template #primary>
      <UButton
        icon="i-lucide-plus"
        :label="t('availability.patterns.new')"
        @click="adding = true"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <EmptyState
          v-if="!d.patterns.length"
          icon="i-lucide-repeat"
          :title="t('availability.patterns.none')"
          :description="t('availability.patterns.none-help')"
          :action="{ label: t('availability.patterns.new'), icon: 'i-lucide-plus', onClick: () => { adding = true } }"
        />
        <RecordList
          v-else
          :label="t('availability.patterns.title')"
        >
          <RecordListItem
            v-for="p in d.patterns"
            :key="p.id"
            :to="`/members/availability/patterns/${p.id}`"
            icon="i-lucide-repeat"
            :name="p.label"
            :description="`${covers(p)} · ${summary(p)}`"
          >
            <RowActions
              :label="t('availability.patterns.actions', { label: p.label })"
              :items="[{ label: t('availability.patterns.remove'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => remove(p) }]"
            />
          </RecordListItem>
        </RecordList>
        <USlideover
          v-model:open="adding"
          :title="t('availability.patterns.new')"
          :description="t('availability.patterns.new-help')"
        >
          <template #body>
            <AvailabilityPatternForm
              :patterns="d.patterns"
              :today="d.today"
              :horizon="d.horizon"
              @saved="opened"
            />
          </template>
        </USlideover>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
