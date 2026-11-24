<!-- Support us (P1, FR-09): the campaigns open now, with their progress where they show it, and the
     funds a donor may give to, each with a way to give. -->
<script setup lang="ts">
const { t } = useT()
useSeoMeta({ title: () => t('fundraising.support.title') })
const { data, status, error, refresh } = await useAPI<{
  campaigns: { slug: string, title: string, summary: string, progress: { raisedMinor: number, targetMinor: number | null, currency: string } | null }[]
  funds: { id: string, name: string, purpose: string | null, isDefault: boolean }[]
}>('/api/fundraising/support', { key: 'fundraising:support' })
</script>

<template>
  <PageFrame
    :title="t('fundraising.support.title')"
    :description="t('fundraising.support.help')"
    width="reading"
  >
    <template #primary>
      <UButton
        to="/support/give"
        icon="i-lucide-hand-heart"
        :label="t('fundraising.support.give')"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div class="space-y-8">
        <PageSection
          v-if="data?.campaigns.length"
          :title="t('fundraising.support.campaigns')"
        >
          <div class="grid gap-4 sm:grid-cols-2">
            <UPageCard
              v-for="c in data.campaigns"
              :key="c.slug"
              :to="`/support/${c.slug}`"
              :title="c.title"
              :description="c.summary"
            >
              <FundraisingProgress
                v-if="c.progress"
                :progress="c.progress"
              />
            </UPageCard>
          </div>
        </PageSection>
        <PageSection :title="t('fundraising.support.funds')">
          <RecordList :label="t('fundraising.support.funds')">
            <RecordListItem
              v-for="f in data?.funds ?? []"
              :key="f.id"
              :to="`/support/give?fund=${f.id}`"
              icon="i-lucide-piggy-bank"
              :name="f.name"
              :description="f.purpose ?? undefined"
            />
          </RecordList>
        </PageSection>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
