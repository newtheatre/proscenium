<!-- My forms (FB-304): what the person has started, to carry on with, and what they have sent,
     with its reference. It sits in the account, so an audience member is never sent to a members'
     screen to find a form they answered. -->
<script setup lang="ts">
interface Mine {
  drafts: { responseId: string, title: string, slug: string, open: boolean, updatedAt: number }[]
  sent: { responseId: string, reference: string, title: string, slug: string, submittedAt: number }[]
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
        v-if="!data?.drafts.length && !data?.sent.length"
        icon="i-lucide-file-text"
        :title="t('forms.screens.mine.none')"
        :description="t('forms.screens.mine.none-help')"
      />
      <div
        v-else
        class="space-y-8"
      >
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
            />
          </RecordList>
        </section>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
