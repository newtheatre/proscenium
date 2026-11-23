<!-- A scheme's join page (MEM-10, MEM-11), at the address the scheme's key makes: the link and QR
     poster a committee hands out. It says what the scheme is and what it costs, asks a visitor to
     sign in here and come back, then offers the join form. A signed-out visitor sees the scheme only
     while membership.join.public-listing is on; otherwise they are asked to sign in first. -->
<script setup lang="ts">
import type { OfferedScheme } from '../../utils/membership-join'

interface Mine { memberships: { schemeId: string, status: 'upcoming' | 'current' | 'in-grace' | 'lapsed' }[], applications: { id: string, schemeId: string, waiting: 'staff' | 'approval' | 'payment' }[] }

const { t } = useT()
const route = useRoute()
const { viewer } = useViewer()
const key = computed(() => String(route.params.key))
const offered = await useAPI<{ schemes: OfferedScheme[] }>('/api/membership/schemes', { key: 'membership:offered' })
// Only asked once signed in; signing in on this page asks it then, without leaving.
const mine = await useAPI<Mine>('/api/membership/mine', { key: 'membership:mine', immediate: viewer.value.signedIn })
watch(() => viewer.value.signedIn, (signedIn) => {
  if (signedIn) void Promise.all([mine.refresh(), offered.refresh()])
})

const scheme = computed(() => offered.data.value?.schemes.find(s => s.key === key.value) ?? null)
const holding = computed(() => !!scheme.value && (mine.data.value?.memberships ?? []).some(m => m.schemeId === scheme.value!.id && m.status !== 'lapsed'))
const application = computed(() => scheme.value ? (mine.data.value?.applications ?? []).find(a => a.schemeId === scheme.value!.id) ?? null : null)
const fee = computed(() => {
  const s = scheme.value
  if (!s?.requiresPayment) return undefined
  if (s.fee) return t('membership.screens.mine.fee', { amount: membershipMoney(s.fee) })
  const priced = s.options.filter(o => o.fee)
  if (!priced.length) return undefined
  return priced.length === 1 ? t('membership.screens.mine.fee', { amount: membershipMoney(priced[0]!.fee!) }) : priced.map(o => `${o.name}: ${membershipMoney(o.fee!)}`).join(' · ')
})
const title = computed(() => scheme.value ? t('membership.join.title', { scheme: scheme.value.name }) : t('membership.join.title-unknown'))
useSeoMeta({ title, description: () => scheme.value?.summary ?? undefined })
</script>

<template>
  <PageFrame
    :title="title"
    width="reading"
  >
    <DataBoundary
      :data="offered.data.value"
      :status="offered.status.value"
      :error="offered.error.value"
      @retry="offered.refresh()"
    >
      <div class="space-y-6">
        <template v-if="scheme">
          <PageSection :title="t('membership.join.about-title')">
            <MarkdownText
              v-if="scheme.summary"
              :text="scheme.summary"
              class="text-sm text-muted"
            />
            <p
              v-if="fee"
              class="text-sm"
            >
              {{ fee }}
            </p>
            <p class="text-sm text-muted">
              {{ t(scheme.side === 'members' ? 'membership.join.members-side' : 'membership.join.audience-side') }}
            </p>
          </PageSection>

          <PageSection
            v-if="!viewer.signedIn"
            :title="t('membership.join.sign-in-title')"
            :description="t('membership.join.sign-in-help')"
          >
            <SignInForm :next="route.fullPath" />
          </PageSection>
          <UAlert
            v-else-if="holding"
            color="success"
            variant="subtle"
            icon="i-lucide-id-card"
            :title="t('membership.join.holding', { scheme: scheme.name })"
            :actions="[{ label: t('membership.join.to-mine'), to: '/account/membership', color: 'neutral', variant: 'outline' }]"
          />
          <UAlert
            v-else-if="application"
            color="info"
            variant="subtle"
            icon="i-lucide-hourglass"
            :title="t('membership.join.waiting', { scheme: scheme.name })"
            :description="application.waiting === 'payment' ? t('membership.join.waiting-payment') : t(application.waiting === 'approval' ? 'membership.screens.mine.waiting-approval' : 'membership.screens.mine.waiting-staff')"
            :actions="[application.waiting === 'payment'
              ? { label: t('membership.join.pay'), to: `/account/membership/${application.id}/pay` }
              : { label: t('membership.join.to-mine'), to: '/account/membership', color: 'neutral', variant: 'outline' }]"
          />
          <PageSection
            v-else
            :title="t('membership.join.form-title')"
          >
            <p
              v-if="scheme.joinMode === 'staff-only'"
              class="text-sm text-muted"
            >
              {{ t('membership.join.staff-only') }}
            </p>
            <p
              v-else-if="!scheme.online"
              class="text-sm text-muted"
            >
              {{ t('membership.join.not-online') }}
            </p>
            <MembershipJoinForm
              v-else
              :scheme="scheme"
              @applied="mine.refresh()"
            />
          </PageSection>
        </template>

        <template v-else-if="!viewer.signedIn">
          <PageSection
            :title="t('membership.join.sign-in-title')"
            :description="t('membership.join.sign-in-first')"
          >
            <SignInForm :next="route.fullPath" />
          </PageSection>
        </template>

        <EmptyState
          v-else
          icon="i-lucide-id-card"
          :title="t('membership.join.not-open')"
          :description="t('membership.join.not-open-help')"
          :action="{ label: t('membership.join.see-all'), to: '/account/membership' }"
        />
      </div>
    </DataBoundary>
  </PageFrame>
</template>
