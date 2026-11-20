<!-- The access scheme in My account (ID-38, ID-44; identity spec part 6). Before applying: what the
     scheme is, who will read an application, and an "Apply" button to the form (access/apply).
     Afterwards: the application's state in plain words, the reviewer's message, change or leave,
     switches for other uses, and every read by staff. With the scheme off it is a missing page. -->
<script setup lang="ts">
import type { AccessApplicationValue } from '../../../composables/useAccessApplicationForm'
import type { RefusalView } from '../../../utils/refusal'

interface Mine {
  enabled: boolean
  name?: string
  allowNote?: boolean
  needs?: { id: string, key: string, label: string }[]
  application?: {
    status: 'submitted' | 'more-info' | 'accepted' | 'rejected'
    inForce: AccessApplicationValue | null
    pending: AccessApplicationValue | null
    message: string | null
    verified: boolean
    companions: number
    submittedVia: 'self' | 'staff'
    submittedAt: number
    decidedAt: number | null
    reviewDue: number | null
  } | null
  sharing?: { id: string, label: string, explanation: string, on: boolean, fixed: boolean }[]
  reads?: { at: number, capacity: string | null, purpose: string | null }[]
}

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()

const { data, refresh } = await useAPI<Mine>('/api/core/me/access', { key: 'core:my-access' })
if (!data.value?.enabled) throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })

const name = computed(() => data.value?.name ?? '')
const application = computed(() => data.value?.application ?? null)
const { dayLong: day } = useDates()

/** "My details are still right" is offered from this long before the review date, and after it. */
const CONFIRM_WITHIN = 30 * 24 * 60 * 60 * 1000 // not-policy: a month's notice, in milliseconds
const confirmable = computed(() => !!application.value?.reviewDue && application.value.reviewDue - Date.now() <= CONFIRM_WITHIN)
/** Companions were asked for or are in place, so there is evidence to show in person. */
const showEvidence = computed(() => application.value?.status !== 'rejected' && !application.value?.verified
  && ((application.value?.pending?.companions ?? 0) > 0 || (application.value?.inForce?.companions ?? 0) > 0))

const refusal = ref<RefusalView | null>(null)
const APPLY = '/account/access/apply'

async function leave() {
  const ok = await confirm({
    verb: t('core.access.leave.verb'),
    thing: t('core.access.leave.thing', { scheme: name.value }),
    consequence: t('core.access.leave.consequence'),
    button: t('core.access.leave.button'),
  })
  if (!ok) return
  try {
    await $api('/api/core/me/access', { method: 'DELETE', body: {} })
    toast.add({ title: t('core.access.left', { scheme: name.value }), color: 'success' })
    await refresh()
  }
  catch (error) {
    refusal.value = toRefusal(error)
  }
}

async function confirmStillRight() {
  try {
    await $api('/api/core/me/access/confirm', { method: 'POST', body: {} })
    toast.add({ title: t('core.access.confirmed'), color: 'success' })
    await refresh()
  }
  catch (error) {
    refusal.value = toRefusal(error)
  }
}

async function share(purpose: string, on: boolean) {
  try {
    await $api('/api/core/me/access/sharing', { method: 'PUT', body: { purpose, on } })
  }
  catch (error) {
    refusal.value = toRefusal(error)
  }
  await refresh()
}

const STATUS = {
  'submitted': { tone: 'info', key: 'core.access.status.submitted' },
  'more-info': { tone: 'warning', key: 'core.access.status.more-info' },
  'accepted': { tone: 'success', key: 'core.access.status.accepted' },
  'rejected': { tone: 'danger', key: 'core.access.status.rejected' },
} as const

const purposeLabel = (read: { capacity: string | null, purpose: string | null }) =>
  read.purpose
    ? (data.value?.sharing?.find(p => p.id === read.purpose)?.label ?? read.purpose)
    : t('core.access.reads.reviewer')
</script>

<template>
  <PageFrame
    :title="name"
    :trail="[{ label: t('core.account.title'), to: '/account' }]"
    width="reading"
  >
    <RefusalNotice :refusal="refusal" />

    <!-- Before applying. -->
    <div
      v-if="!application"
      class="space-y-4"
    >
      <p>{{ t('core.access.intro', { scheme: name }) }}</p>
      <p class="text-muted">
        {{ t('core.access.intro-detail') }}
      </p>
      <UAlert
        color="neutral"
        icon="i-lucide-eye"
        :title="t('core.access.form.who-reads')"
        :description="t('core.access.form.who-reads-detail')"
      />
      <UButton
        icon="i-lucide-file-pen-line"
        :label="t('core.access.apply')"
        :to="APPLY"
      />
    </div>

    <!-- Afterwards. -->
    <div
      v-else
      class="space-y-8"
    >
      <PageSection
        :title="t('core.access.state')"
      >
        <StatusBadge
          :tone="STATUS[application.status].tone"
          :label="t(STATUS[application.status].key)"
        />
        <p>{{ t(`${STATUS[application.status].key}.detail`, { scheme: name }) }}</p>
        <p
          v-if="application.submittedVia === 'staff'"
          class="text-sm text-muted"
        >
          {{ t('core.access.made-by-staff') }}
        </p>
        <UAlert
          v-if="application.message"
          color="neutral"
          variant="outline"
          icon="i-lucide-message-square"
          :title="t('core.access.message')"
          :description="application.message"
        />
        <p
          v-if="application.status === 'accepted' && application.pending"
          class="text-sm"
        >
          {{ t('core.access.change-waiting') }}
        </p>
      </PageSection>

      <PageSection
        v-if="application.inForce || application.pending"
        :title="application.inForce ? t('core.access.in-force') : t('core.access.asked')"
      >
        <AccessApplicationSummary
          :value="(application.inForce ?? application.pending)!"
          :needs="data?.needs ?? []"
        />
        <p
          v-if="application.status === 'accepted'"
          class="text-sm text-muted"
        >
          {{ application.verified ? t('core.access.verified') : t('core.access.not-verified') }}
        </p>
        <p
          v-if="showEvidence"
          class="text-sm"
        >
          {{ t('core.access.evidence') }}
        </p>
      </PageSection>

      <div class="flex flex-wrap gap-2">
        <UButton
          v-if="application.status !== 'rejected'"
          icon="i-lucide-pencil"
          :label="application.status === 'more-info' ? t('core.access.answer') : t('core.access.change')"
          :to="APPLY"
        />
        <UButton
          v-else
          icon="i-lucide-file-pen-line"
          :label="t('core.access.apply-again')"
          :to="APPLY"
        />
        <UButton
          v-if="application.status === 'accepted' && confirmable"
          color="neutral"
          variant="outline"
          icon="i-lucide-check"
          :label="t('core.access.still-right')"
          @click="confirmStillRight"
        />
        <UButton
          color="error"
          variant="ghost"
          icon="i-lucide-log-out"
          :label="t('core.access.leave.button')"
          @click="leave"
        />
      </div>
      <p
        v-if="application.status === 'accepted' && application.reviewDue"
        class="text-sm text-muted"
      >
        {{ t('core.access.review-due', { date: day(application.reviewDue) }) }}
      </p>
    </div>

    <PageSection
      v-if="application && data?.sharing?.length"
      class="mt-8"
      :title="t('core.access.sharing')"
      :description="t('core.access.sharing-help')"
    >
      <USwitch
        v-for="purpose in data.sharing"
        :key="purpose.id"
        :model-value="purpose.on"
        :label="purpose.label"
        :description="purpose.explanation"
        :disabled="purpose.fixed"
        @update:model-value="share(purpose.id, $event)"
      />
    </PageSection>

    <PageSection
      v-if="application"
      class="mt-8"
      :title="t('core.access.reads.title')"
    >
      <p
        v-if="!data?.reads?.length"
        class="text-sm text-muted"
      >
        {{ t('core.access.reads.none') }}
      </p>
      <ul
        v-else
        class="space-y-1 text-sm"
      >
        <li
          v-for="(read, i) in data.reads"
          :key="i"
        >
          {{ t('core.access.reads.line', { date: day(read.at), by: purposeLabel(read) }) }}
        </li>
      </ul>
    </PageSection>
  </PageFrame>
</template>
