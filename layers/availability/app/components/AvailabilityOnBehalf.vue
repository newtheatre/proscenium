<!-- Mark someone away (A8), from a request I sent: what I have already added for them, which I may
     remove, and the change form limited to busy or maybe. They are told and may change it. -->
<script setup lang="ts">
const props = defineProps<{ accountId: string, name: string }>()
const { t } = useT()
const dates = useDates()
const { $api } = useNuxtApp()
const toast = useToast()
const { toRefusal, phrase } = useRefusal()

interface Added { id: string, firstDate: string, lastDate: string, from: string | null, until: string | null, level: 'busy' | 'maybe', reason: string | null }
const { data, status, error, refresh } = await useAPI<{ today: string, horizon: string, step: number, entries: Added[] }>('/api/availability/on-behalf', {
  key: `availability:on-behalf:${props.accountId}`,
  query: { accountId: props.accountId },
})

function when(e: Added): string {
  const days = e.firstDate === e.lastDate ? dates.dayNamed(e.firstDate) : dates.range(e.firstDate, e.lastDate)
  return `${days}, ${e.from && e.until ? `${e.from} to ${e.until}` : t('availability.mine.all-day')}`
}

async function remove(id: string) {
  try {
    await $api(`/api/availability/on-behalf/${id}`, { method: 'DELETE', body: {} })
    toast.add({ title: t('availability.mine.entry-removed'), color: 'success' })
    await refresh()
  }
  catch (e) {
    const refusal = toRefusal(e)
    toast.add({ title: phrase(refusal.reason) ?? t('availability.mine.failed'), color: 'error' })
  }
}

async function saved() {
  toast.add({ title: t('availability.behalf.saved', { name: props.name }), color: 'success' })
  await refresh()
}
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: d }">
      <div class="space-y-6">
        <PageSection
          v-if="d.entries.length"
          :title="t('availability.behalf.added')"
        >
          <RecordList flush>
            <RecordListItem
              v-for="e in d.entries"
              :key="e.id"
              :name="when(e)"
              :description="[t(`availability.levels.${e.level}`), e.reason].filter(Boolean).join(' · ')"
            >
              <template #trailing>
                <IconButton
                  icon="i-lucide-trash-2"
                  :label="t('availability.mine.remove')"
                  @click="remove(e.id)"
                />
              </template>
            </RecordListItem>
          </RecordList>
        </PageSection>
        <AvailabilityEntryForm
          :key="d.entries.length"
          :today="d.today"
          :horizon="d.horizon"
          :step="d.step"
          :for-account="accountId"
          @saved="saved"
        />
      </div>
    </template>
  </DataBoundary>
</template>
