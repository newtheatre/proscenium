<!-- My awards: what the theatre has given the person, with the citation, and their choice of where
     each is listed. Their choice stands over the theatre's default. -->
<script setup lang="ts">
interface Mine { id: string, typeName: string, awardedOn: string, awardedFor: string | null, citation: string | null, visibility: 'public' | 'members' | 'hidden' }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { day } = useDates()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ awards: Mine[] }>('/api/awards/mine', { key: 'awards:mine' })
const visibilities = computed(() => (['public', 'members', 'hidden'] as const).map(v => ({ value: v, label: t(`awards.screens.visibility.${v}`) })))

async function list(award: Mine, visibility: Mine['visibility']) {
  try {
    await $api(`/api/awards/mine/${award.id}/visibility` as string, { method: 'POST', body: { visibility } })
    toast.add({ title: t('awards.screens.mine.listed-toast'), color: 'success' })
  }
  catch (e) {
    const refusal = toRefusal(e)
    toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
  }
  await refresh()
}
</script>

<template>
  <PageFrame
    :title="t('awards.navigation.mine.label')"
    :description="t('awards.screens.mine.help')"
    width="reading"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.awards.length"
        icon="i-lucide-award"
        :title="t('awards.screens.mine.none')"
      />
      <div
        v-else
        class="space-y-6"
      >
        <PageSection
          v-for="award in data.awards"
          :key="award.id"
          :title="award.typeName"
          :description="[day(award.awardedOn), award.awardedFor].filter(Boolean).join(' · ')"
        >
          <p
            v-if="award.citation"
            class="whitespace-pre-line"
          >
            {{ award.citation }}
          </p>
          <UFormField
            :label="t('awards.screens.mine.listed')"
            :help="t('awards.screens.mine.listed-help')"
          >
            <USelect
              :model-value="award.visibility"
              :items="visibilities"
              @update:model-value="(v: Mine['visibility']) => list(award, v)"
            />
          </UFormField>
        </PageSection>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
