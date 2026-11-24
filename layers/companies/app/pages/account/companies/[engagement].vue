<!-- Your engagement (part 5, CO-19 and the start of CO-20): what a company's contact sees of one
     engagement on their phone: its dates, the agreement to read and answer once, the calls, and who
     from the company is coming. Guests join it with their slice. -->
<script setup lang="ts">
import type { AgreementVersion } from '../../../../shared/views'

interface Outline { id: string, title: string, companyPublicName: string, state: string, currency: string, firstDate: number | null, lastDate: number | null }

const { t } = useT()
const route = useRoute()
const id = computed(() => String(route.params.engagement))
const dates = useDates()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const { deal, extras, stateBadge } = useAgreementWords()
const { data, status, error, refresh } = await useAPI<{ engagement: Outline }>(() => `/api/companies/engagements/${id.value}`, { key: `companies:mine:${id.value}` })
const { data: agreement, refresh: refreshAgreement } = await useAPI<{ versions: AgreementVersion[], canAnswer: boolean }>(() => `/api/companies/engagements/${id.value}/agreements`, { key: `companies:mine:agreement:${id.value}` })
const engagement = computed(() => data.value?.engagement ?? null)
const current = computed(() => agreement.value?.versions.find(v => v.state === 'sent') ?? agreement.value?.versions.find(v => v.state === 'accepted') ?? null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const when = (e: Outline) => e.firstDate ? (e.lastDate && e.lastDate !== e.firstDate ? dates.range(e.firstDate, e.lastDate) : dates.day(e.firstDate)) : t('companies.mine.no-dates')

async function answer(v: AgreementVersion, choice: 'accepted' | 'declined') {
  if (choice === 'declined' && !await confirm({ verb: t('companies.agreements.decline'), thing: t('companies.agreements.version-short', { version: v.version }), consequence: t('companies.agreements.decline-consequence'), button: t('companies.agreements.decline') })) return
  refusal.value = null
  try {
    await $api(`/api/companies/engagements/${id.value}/agreements/${v.id}/answer` as string, { method: 'POST', body: { answer: choice } })
    await Promise.all([refresh(), refreshAgreement()])
    toast.add({ title: t(choice === 'accepted' ? 'companies.agreements.you-accepted' : 'companies.agreements.you-declined'), color: 'success' })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <PageFrame
    :title="engagement?.title ?? t('companies.navigation.mine.label')"
    :description="engagement ? `${engagement.companyPublicName} · ${when(engagement)}` : undefined"
    :trail="[{ label: t('core.account.title'), to: '/account' }, { label: t('companies.navigation.mine.label'), to: '/account/companies' }]"
    width="reading"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div class="space-y-6">
        <RefusalNotice :refusal="refusal" />
        <PageSection
          :title="t('companies.tabs.agreement')"
          :description="current ? t('companies.agreements.version', { version: current.version, deal: t(`companies.agreements.deal.${current.dealType}`) }) : undefined"
        >
          <template
            v-if="current"
            #actions
          >
            <StatusBadge v-bind="stateBadge(current)" />
          </template>
          <EmptyState
            v-if="!current"
            :title="t('companies.agreements.none-yet')"
            :description="t('companies.agreements.none-yet-description')"
            icon="i-lucide-file-text"
          />
          <div
            v-else
            class="space-y-4"
          >
            <FactStrip
              :facts="[
                { label: t('companies.agreements.terms'), value: deal(current, engagement!.currency) },
                ...(extras(current, engagement!.currency) ? [{ label: t('companies.agreements.also'), value: extras(current, engagement!.currency) }] : []),
              ]"
            />
            <MarkdownText
              v-if="current.clauses"
              :text="current.clauses"
            />
            <div
              v-if="current.state === 'sent' && agreement?.canAnswer"
              class="flex flex-wrap gap-2"
            >
              <UButton
                :label="t('companies.agreements.accept')"
                icon="i-lucide-check"
                loading-auto
                @click="answer(current, 'accepted')"
              />
              <UButton
                :label="t('companies.agreements.decline')"
                color="neutral"
                variant="outline"
                loading-auto
                @click="answer(current, 'declined')"
              />
            </div>
          </div>
        </PageSection>
        <CompaniesSchedule
          v-if="engagement"
          :engagement-id="engagement.id"
          :closed="['cancelled', 'settled'].includes(engagement.state)"
        />
      </div>
    </DataBoundary>
  </PageFrame>
</template>
