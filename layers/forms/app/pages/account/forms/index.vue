<!-- My forms (FB-304): what the person has started, to carry on with, and what they have sent,
     with its reference. It sits in the account, so an audience member is never sent to a members'
     screen to find a form they answered. -->
<script setup lang="ts">
interface Mine {
  drafts: { responseId: string, title: string, slug: string, open: boolean, updatedAt: number }[]
  reviews: { assignmentId: string, title: string, reference: string, stage: string, mode: 'scores' | 'vote', status: 'assigned' | 'submitted', released: boolean }[]
  sent: { responseId: string, reference: string, title: string, slug: string, submittedAt: number, progress: { status: string, kind: string, canChange: boolean } | null }[]
}
const { t } = useT()
const { dateTime } = useDates()
const { data, status, error, refresh } = await useAPI<Mine>('/api/forms/mine', { key: 'forms:mine' })
</script>

<template>
  <PageFrame
    :title="t('forms.navigation.mine.label')"
    :description="t('forms.screens.mine.help')"
    width="reading"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.drafts.length && !data?.sent.length && !data?.reviews.length"
        icon="i-lucide-file-text"
        :title="t('forms.screens.mine.none')"
        :description="t('forms.screens.mine.none-help')"
      />
      <div
        v-else
        class="space-y-8"
      >
        <section
          v-if="data.reviews.length"
          class="space-y-2"
        >
          <h2 class="font-medium">
            {{ t('forms.screens.mine.reviews') }}
          </h2>
          <RecordList :label="t('forms.screens.mine.reviews')">
            <RecordListItem
              v-for="r in data.reviews"
              :key="r.assignmentId"
              :to="`/account/forms/review/${r.assignmentId}`"
              :name="r.title"
              :description="t('forms.screens.mine.review-of', { reference: r.reference, stage: r.stage })"
            >
              <StatusBadge
                :tone="r.status === 'submitted' ? 'success' : 'warning'"
                :label="t(r.status === 'submitted' ? 'forms.screens.mine.review-done' : r.mode === 'vote' ? 'forms.screens.mine.review-vote' : 'forms.screens.mine.review-marks')"
              />
            </RecordListItem>
          </RecordList>
        </section>
        <section
          v-if="data.drafts.length"
          class="space-y-2"
        >
          <h2 class="font-medium">
            {{ t('forms.screens.mine.drafts') }}
          </h2>
          <RecordList :label="t('forms.screens.mine.drafts')">
            <RecordListItem
              v-for="d in data.drafts"
              :key="d.responseId"
              :to="d.open ? `/forms/${d.slug}` : undefined"
              :name="d.title"
              :description="d.open ? t('forms.screens.mine.last-changed', { when: dateTime(d.updatedAt) }) : t('forms.screens.mine.closed')"
            >
              <StatusBadge
                :tone="d.open ? 'warning' : 'neutral'"
                :label="d.open ? t('forms.screens.mine.unfinished') : t('forms.screens.status.closed')"
              />
            </RecordListItem>
          </RecordList>
        </section>
        <section
          v-if="data.sent.length"
          class="space-y-2"
        >
          <h2 class="font-medium">
            {{ t('forms.screens.mine.sent') }}
          </h2>
          <RecordList :label="t('forms.screens.mine.sent')">
            <RecordListItem
              v-for="s in data.sent"
              :key="s.responseId"
              :to="`/account/forms/${s.responseId}`"
              :name="s.title"
              :description="t('forms.screens.mine.sent-on', { when: dateTime(s.submittedAt), reference: s.reference })"
            >
              <StatusBadge
                v-if="s.progress"
                :tone="formsStageTone(s.progress.kind)"
                :label="s.progress.status"
              />
            </RecordListItem>
          </RecordList>
        </section>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
