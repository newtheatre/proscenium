<!-- M5 My training (training-records part 5; amended part 5): every training record the person has
     held with its status and dates, then the certificates and declarations they sent, each with its
     state and any reason. A certificate is added from the course it counts towards. -->
<script setup lang="ts">
import type { EvidenceView } from '../../../../server/evidence'
import type { RecordView } from '../../../../server/progress'

const { t } = useT()
const { day } = useDates()
const act = useTrainingAct()
const { toRefusal } = useRefusal()
const toast = useToast()
const [{ data, status, error, refresh }, { data: sent, refresh: refreshSent }] = await Promise.all([
  useAPI<{ records: RecordView[] }>('/api/training/me/records', { key: 'training:me:records' }),
  useAPI<{ evidence: EvidenceView[] }>('/api/training/me/evidence', { key: 'training:me:evidence', default: () => ({ evidence: [] }) }),
])
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

const STANDING: Record<RecordView['standing'], 'success' | 'warning' | 'danger' | 'neutral'> = { current: 'success', expiring: 'warning', lapsed: 'danger', superseded: 'neutral', revoked: 'neutral' }
const standing = (r: RecordView) => r.cutReason && (r.standing === 'current' || r.standing === 'expiring')
  ? { tone: 'warning' as const, label: t('training.status.ends-early') }
  : { tone: STANDING[r.standing], label: t(`training.status.${r.standing}`) }
const dates = (r: RecordView) => [t('training.mine.awarded', { date: day(r.awardedAt) }), r.expiresAt ? t(r.expiresAt < Date.now() ? 'training.mine.expired' : 'training.mine.expires', { date: day(r.expiresAt) }) : t('training.course.no-expiry')].join(' · ')

const EVIDENCE: Record<EvidenceView['state'], 'info' | 'success' | 'warning' | 'neutral'> = { submitted: 'info', verified: 'success', rejected: 'warning', withdrawn: 'neutral' }
const detail = (e: EvidenceView) => [e.step, e.kind === 'certificate' ? e.issuer : e.organisation, e.state === 'rejected' && e.rejectReason ? t('training.mine.reason', { reason: e.rejectReason }) : null].filter(Boolean).join(' · ')
async function withdraw(e: EvidenceView) {
  refusal.value = null
  try {
    await act(`/api/training/evidence/${encodeURIComponent(e.id)}/withdraw`, { method: 'POST', body: {} })
    toast.add({ title: t('training.mine.withdrawn'), color: 'success' })
    await refreshSent()
  }
  catch (err) {
    refusal.value = toRefusal(err)
  }
}
const trail = computed(() => [{ label: t('training.navigation.home.label'), to: '/members/training' }])
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh(); refreshSent()"
  >
    <template #default="{ data: d }">
      <PageFrame
        :title="t('training.mine.title')"
        :trail="trail"
      >
        <template #primary>
          <UButton
            to="/members/training/courses?way=from-outside"
            icon="i-lucide-file-plus"
            :label="t('training.mine.add-certificate')"
          />
        </template>
        <div class="space-y-8">
          <RefusalNotice :refusal="refusal" />
          <PageSection :title="t('training.mine.records')">
            <EmptyState
              v-if="!d.records.length"
              :title="t('training.mine.no-records.title')"
              :description="t('training.mine.no-records.description')"
              icon="i-lucide-award"
              :action="{ label: t('training.home.empty.action'), to: '/members/training/courses' }"
            />
            <RecordList
              v-else
              :label="t('training.mine.records')"
            >
              <RecordListItem
                v-for="r in d.records"
                :key="r.id"
                icon="i-lucide-award"
                :name="r.courseTitle"
                :description="dates(r)"
                :muted="r.standing === 'superseded'"
              >
                <StatusBadge v-bind="standing(r)" />
              </RecordListItem>
            </RecordList>
          </PageSection>
          <PageSection
            v-if="sent?.evidence.length"
            :title="t('training.mine.evidence')"
          >
            <RecordList :label="t('training.mine.evidence')">
              <RecordListItem
                v-for="e in sent.evidence"
                :key="e.id"
                :icon="e.kind === 'certificate' ? 'i-lucide-file-badge' : 'i-lucide-file-pen-line'"
                :name="e.course"
                :description="detail(e)"
                :muted="e.state === 'withdrawn'"
              >
                <StatusBadge
                  :tone="EVIDENCE[e.state]"
                  :label="t(`training.evidence-states.${e.state}`)"
                />
                <template #trailing>
                  <UButton
                    v-if="e.state === 'submitted'"
                    color="neutral"
                    variant="ghost"
                    :label="t('training.mine.withdraw')"
                    loading-auto
                    @click="withdraw(e)"
                  />
                </template>
              </RecordListItem>
            </RecordList>
          </PageSection>
        </div>
      </PageFrame>
    </template>
  </DataBoundary>
</template>
