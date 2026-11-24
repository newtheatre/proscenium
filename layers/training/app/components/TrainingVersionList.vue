<!-- K2's Versions tab: every version, newest first, with its state, what kind of change it was and the
     note its author wrote. -->
<script setup lang="ts">
import type { Version } from '../../server/courses'

defineProps<{ versions: Version[] }>()
const { t } = useT()
const { day } = useDates()
const TONE = { 'in-preparation': 'warning', 'live': 'success', 'replaced': 'neutral' } as const
const describe = (v: Version) => [
  v.publishedAt ? t('training.versions.published', { day: day(v.publishedAt) }) : null,
  v.changeKind ? t(`training.change-kinds.${v.changeKind}`) : null,
  v.changeNote,
].filter(Boolean).join(' · ')
</script>

<template>
  <RecordList :label="t('training.course-record.tab.versions')">
    <RecordListItem
      v-for="v in versions"
      :key="v.id"
      icon="i-lucide-git-commit-vertical"
      :name="t('training.courses-list.version', { number: v.number })"
      :description="describe(v) || undefined"
    >
      <StatusBadge
        :tone="TONE[v.status]"
        :label="t(`training.version-states.${v.status}`)"
      />
    </RecordListItem>
  </RecordList>
</template>
