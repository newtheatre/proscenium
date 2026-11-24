<!-- K9 Evidence to check (training-records part 5; TR-47): certificates and declarations waiting,
     oldest first, on the courses where this person checks evidence. A row opens the panel to decide it. -->
<script setup lang="ts">
import type { EvidenceView } from '../../../../../server/evidence'

definePageMeta({ layout: 'console' })

const { t } = useT()
const { day } = useDates()
const kind = ref<'all' | 'certificate' | 'declaration'>('all')
const query = computed(() => kind.value === 'all' ? {} : { kind: kind.value })
const { data, status, error, refresh } = await useAPI<{ evidence: EvidenceView[] }>('/api/training/evidence', { key: 'training:evidence-queue', query })
const chosen = ref<EvidenceView | null>(null)
const kinds = computed(() => (['all', 'certificate', 'declaration'] as const).map(value => ({ value, label: t(`training.evidence-queue.kind.${value}`) })))
const nameOf = (e: EvidenceView) => e.person ?? t('training.teaching.no-name')

async function decided() {
  chosen.value = null
  await refresh()
}
</script>

<template>
  <PageFrame :title="t('training.navigation.evidence.label')">
    <div class="space-y-4">
      <UFormField
        :label="t('training.evidence-queue.kind.label')"
        class="max-w-xs"
      >
        <USelect
          v-model="kind"
          :items="kinds"
        />
      </UFormField>
      <DataBoundary
        :data="data"
        :status="status"
        :error="error"
        @retry="refresh()"
      >
        <template #default="{ data: d }">
          <RecordList
            v-if="d.evidence.length"
            :label="t('training.navigation.evidence.label')"
          >
            <RecordListItem
              v-for="e in d.evidence"
              :key="e.id"
              :icon="e.kind === 'certificate' ? 'i-lucide-file-badge' : 'i-lucide-file-text'"
              :name="nameOf(e)"
              :description="t(`training.evidence-queue.row.${e.kind}`, { course: e.course, day: day(e.createdAt) })"
            >
              <div class="flex items-center gap-2">
                <StatusBadge
                  v-if="e.overdue"
                  tone="warning"
                  :label="t('training.evidence-queue.overdue')"
                />
                <StatusBadge
                  v-if="e.notOnList"
                  tone="warning"
                  :label="t('training.evidence-queue.not-on-list')"
                />
                <UButton
                  color="neutral"
                  variant="outline"
                  size="sm"
                  :label="t('training.evidence-queue.open')"
                  :aria-label="t('training.evidence-queue.open-for', { name: nameOf(e) })"
                  @click="chosen = e"
                />
              </div>
            </RecordListItem>
          </RecordList>
          <EmptyState
            v-else
            icon="i-lucide-file-check"
            :title="t('training.evidence-queue.empty.title')"
            :description="t('training.evidence-queue.empty.description')"
          />
        </template>
      </DataBoundary>
    </div>
    <TrainingEvidenceReview
      :evidence="chosen"
      @close="chosen = null"
      @decided="decided"
    />
  </PageFrame>
</template>
