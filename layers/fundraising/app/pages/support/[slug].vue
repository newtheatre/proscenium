<!-- A campaign (P2, FR-11): its story, progress where it shows it, and the names of donors who chose
     to be named, with a band or amount only where they allowed it (K3). A closed campaign says so
     and points to its fund instead. -->
<script setup lang="ts">
interface Named { name: string, amountMinor: number | null, band: { fromMinor: number, toMinor: number | null } | null }
interface PublicCampaign {
  slug: string
  title: string
  summary: string
  body: string | null
  state: 'open' | 'closed'
  currency: string
  fund: { id: string, name: string }
  progress: { raisedMinor: number, targetMinor: number | null, currency: string } | null
  names: Named[] | null
}

const { t } = useT()
const { money } = useMoneyText()
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const { data, status, error, refresh } = await useAPI<{ campaign: PublicCampaign }>(() => `/api/fundraising/support/${slug.value}`, { key: `fundraising:support:${slug.value}` })
const c = computed(() => data.value?.campaign)
useSeoMeta({ title: () => c.value?.title ?? t('fundraising.support.title'), description: () => c.value?.summary })
const beside = (n: Named, currency: string) => n.amountMinor !== null
  ? money(n.amountMinor, currency)
  : n.band
    ? (n.band.toMinor === null ? t('fundraising.support.band-top', { from: money(n.band.fromMinor, currency) }) : t('fundraising.support.band', { from: money(n.band.fromMinor, currency), to: money(n.band.toMinor, currency) }))
    : null
</script>

<template>
  <PageFrame
    :title="c?.title ?? t('fundraising.support.title')"
    :description="c?.summary"
    width="reading"
  >
    <template
      v-if="c?.state === 'open'"
      #primary
    >
      <UButton
        :to="`/support/give?campaign=${c.slug}`"
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
      <div
        v-if="c"
        class="space-y-8"
      >
        <UAlert
          v-if="c.state === 'closed'"
          color="info"
          variant="subtle"
          icon="i-lucide-circle-check"
          :title="t('fundraising.support.closed')"
          :actions="[{ label: t('fundraising.support.give-to', { fund: c.fund.name }), to: `/support/give?fund=${c.fund.id}` }]"
        />
        <FundraisingProgress
          v-if="c.progress"
          :progress="c.progress"
        />
        <MarkdownText
          v-if="c.body"
          :text="c.body"
        />
        <PageSection
          v-if="c.names?.length"
          :title="t('fundraising.support.thanks-to')"
        >
          <ul class="divide-y divide-default">
            <li
              v-for="(n, i) in c.names"
              :key="i"
              class="flex justify-between gap-4 py-2"
            >
              <span>{{ n.name }}</span>
              <span
                v-if="beside(n, c.currency)"
                class="text-muted"
              >{{ beside(n, c.currency) }}</span>
            </li>
          </ul>
        </PageSection>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
