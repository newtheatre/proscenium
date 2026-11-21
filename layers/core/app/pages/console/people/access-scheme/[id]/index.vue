<!-- One application to the access scheme (ID-40 to ID-42; identity spec part 6). It opens with where
     the application stands and what the reviewer should do next, then what the person is asking for
     and what is accepted now, the decision, verifying in person and the history. Filling the form in
     for them (the form is [id]/apply) is offered only when nothing is waiting for a decision: a
     first application for somebody new starts from the list. Opening it is recorded; nobody opens
     their own. -->
<script setup lang="ts">
import type { AccessApplicationValue } from '../../../../../composables/useAccessApplicationForm'
import type { RefusalView } from '../../../../../utils/refusal'

interface Opened {
  name: string
  application: {
    flagged: boolean
    status: 'submitted' | 'more-info' | 'accepted' | 'rejected'
    inForce: AccessApplicationValue | null
    pending: AccessApplicationValue | null
    message: string | null
    submittedVia: 'self' | 'staff'
    submittedAt: number
    decidedAt: number | null
    verifiedAt: number | null
    verifiedMethod: 'access-card' | 'document' | 'known' | null
    reviewDue: number | null
  } | null
  history: { at: number, by: string | null, event: string }[]
  needs: { id: string, key: string, label: string, retired: boolean }[]
  allowNote: boolean
}

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const route = useRoute()
const id = computed(() => String(route.params.id))
const base = computed(() => `/api/core/access-scheme/${encodeURIComponent(id.value)}`)
const { data, status, error, refresh } = await useAPI<Opened>(base, { key: `core:access-application:${id.value}` })

const refusal = ref<RefusalView | null>(null)
const busy = ref(false)
const app = computed(() => data.value?.application ?? null)
const { dayLong: day } = useDates()

const STATUS = {
  'submitted': { tone: 'info', key: 'core.access.review.status.submitted' },
  'more-info': { tone: 'warning', key: 'core.access.review.status.more-info' },
  'accepted': { tone: 'success', key: 'core.access.review.status.accepted' },
  'change': { tone: 'info', key: 'core.access.review.status.change' },
  'rejected': { tone: 'danger', key: 'core.access.review.status.rejected' },
} as const
/** Where it stands, with a change to an accepted application as a state of its own. */
const stage = computed(() => app.value?.status === 'accepted' && app.value.pending ? 'change' : app.value?.status)
/** Something is waiting for a reviewer's decision. */
const waiting = computed(() => !!app.value?.pending && app.value.status !== 'more-info')
/** Filling the form in for them, when nothing is waiting: what the section is called. */
const behalf = computed(() => {
  if (waiting.value) return null
  if (!app.value) return 'apply'
  return ({ 'more-info': 'answer', 'accepted': 'change', 'rejected': 'apply-again', 'submitted': null } as const)[app.value.status]
})

/** Sends one action to the application's routes, then reloads it. The path is built at run time. */
async function act(path: string, method: 'POST' | 'PUT', body: object, done: string): Promise<boolean> {
  busy.value = true
  refusal.value = null
  try {
    await $api<unknown>(`${base.value}${path}` as string, { method, body })
    toast.add({ title: done, color: 'success' })
    await refresh()
    return true
  }
  catch (e) {
    refusal.value = toRefusal(e)
    return false
  }
  finally {
    busy.value = false
  }
}

// Deciding.
// No choice is made for the reviewer: one click must not accept.
const decision = reactive<{ action: 'accept' | 'ask' | 'reject' | undefined, companions: number, message: string }>({ action: undefined, companions: 0, message: '' })
watch(() => app.value?.pending?.companions, (asked) => { decision.companions = asked ?? 0 }, { immediate: true })
const actions = computed(() => (['accept', 'ask', 'reject'] as const).map(a => ({
  value: a,
  label: t(`core.access.review.${a}`),
  description: t(`core.access.review.${a}-help`),
})))
const companionChoices = computed(() => Array.from({ length: (app.value?.pending?.companions ?? 0) + 1 }, (_, n) => ({ value: n, label: t(`core.access.form.companions-${n}`) })))
const messageLabel = computed(() => decision.action ? t(`core.access.review.message-for.${decision.action}`) : '')
async function decide() {
  if (!decision.action) return
  const body = decision.action === 'accept'
    ? { action: 'accept', companions: decision.companions, ...(decision.message.trim() ? { message: decision.message } : {}) }
    : { action: decision.action, message: decision.message }
  const done = t(`core.access.review.decided.${decision.action}`, { name: data.value?.name ?? t('core.access.queue.unnamed') })
  if (await act('/decision', 'POST', body, done)) {
    decision.message = ''
    decision.action = undefined
  }
}

// Verifying.
const method = ref<'access-card' | 'document' | 'known'>('access-card')
const methods = computed(() => (['access-card', 'document', 'known'] as const).map(m => ({ value: m, label: t(`core.access.review.method.${m}`) })))
</script>

<template>
  <PageFrame
    :title="data?.name ?? t('core.access.queue.unnamed')"
    :trail="[{ label: t('core.navigation.access-scheme-queue.label'), to: '/console/people/access-scheme' }]"
    width="reading"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div class="space-y-8">
        <RefusalNotice :refusal="refusal" />

        <p v-if="!app">
          {{ t('core.access.review.no-application') }}
        </p>

        <template v-if="app">
          <section
            aria-labelledby="application-state"
            class="space-y-2"
          >
            <h2
              id="application-state"
              class="sr-only"
            >
              {{ t('core.access.state') }}
            </h2>
            <div class="flex flex-wrap items-center gap-2">
              <StatusBadge
                :tone="STATUS[stage!].tone"
                :label="t(STATUS[stage!].key)"
              />
              <StatusBadge
                v-if="app.flagged"
                tone="warning"
                :label="t('core.access.queue.overdue')"
              />
              <StatusBadge
                v-if="app.verifiedAt"
                tone="success"
                :label="t('core.access.review.verified', { method: t(`core.access.review.method.${app.verifiedMethod ?? 'known'}`) })"
              />
            </div>
            <p>{{ t(`${STATUS[stage!].key}.next`) }}</p>
            <p class="text-sm text-muted">
              {{ t(app.submittedVia === 'staff' ? 'core.access.review.sent-by-staff' : 'core.access.review.sent', { date: day(app.submittedAt) }) }}
            </p>
          </section>

          <PageSection
            v-for="part in (['pending', 'inForce'] as const)"
            v-show="app[part]"
            :key="part"
            :title="part === 'inForce' ? t('core.access.review.in-force') : app.status === 'accepted' ? t('core.access.review.asked-change') : t('core.access.review.asked')"
          >
            <AccessApplicationSummary
              v-if="app[part]"
              :value="app[part]!"
              :needs="data?.needs ?? []"
            />
          </PageSection>

          <UAlert
            v-if="app.pending?.answer && waiting"
            color="info"
            variant="subtle"
            icon="i-lucide-message-square-reply"
            :title="t('core.access.review.their-answer')"
            :description="app.pending.answer"
          />

          <UAlert
            v-if="app.message"
            color="neutral"
            variant="outline"
            icon="i-lucide-message-square"
            :title="app.status === 'more-info' ? t('core.access.review.question-sent') : t('core.access.review.last-message')"
            :description="app.message"
          />

          <!-- Decide, when something is waiting. -->
          <PageSection
            v-if="waiting"
            :title="t('core.access.review.decide')"
          >
            <UForm
              class="space-y-4"
              :state="decision"
              novalidate
              @submit="decide"
            >
              <URadioGroup
                v-model="decision.action"
                :legend="t('core.access.review.decision')"
                :items="actions"
              />
              <UFormField
                v-if="decision.action === 'accept'"
                :label="t('core.access.review.companions')"
                :help="t('core.access.review.companions-help')"
              >
                <USelect
                  v-model="decision.companions"
                  :items="companionChoices"
                />
              </UFormField>
              <UFormField
                v-if="decision.action"
                :label="messageLabel"
                :hint="decision.action === 'accept' && decision.companions >= (app.pending?.companions ?? 0) ? t('core.access.form.optional') : undefined"
                :help="t('core.access.review.message-help')"
                :error="refusal?.fields?.message"
              >
                <UTextarea
                  v-model="decision.message"
                  :rows="3"
                  :maxlength="1000"
                />
              </UFormField>
              <UButton
                type="submit"
                :loading="busy"
                :disabled="!decision.action"
                :label="decision.action ? t(`core.access.review.do.${decision.action}`) : t('core.access.review.do.choose')"
              />
            </UForm>
          </PageSection>

          <!-- Verify an accepted application in person. -->
          <PageSection
            v-if="app.status === 'accepted'"
            :title="t('core.access.review.verify')"
            :description="t('core.access.review.verify-help')"
          >
            <div
              v-if="!app.verifiedAt"
              class="flex flex-wrap items-end gap-2"
            >
              <UFormField :label="t('core.access.review.seen')">
                <USelect
                  v-model="method"
                  :items="methods"
                />
              </UFormField>
              <UButton
                :loading="busy"
                icon="i-lucide-badge-check"
                :label="t('core.access.review.mark-verified')"
                @click="act('/verified', 'PUT', { method }, t('core.access.review.marked'))"
              />
            </div>
            <UButton
              v-else
              color="neutral"
              variant="outline"
              :loading="busy"
              :label="t('core.access.review.remove-mark')"
              @click="act('/verified', 'PUT', { method: null }, t('core.access.review.unmarked'))"
            />
          </PageSection>
        </template>

        <!-- Fill the form in for them: only when nothing is waiting for a decision. -->
        <PageSection
          v-if="behalf"
          :title="t(`core.access.review.behalf.${behalf}`)"
          :description="t('core.access.review.behalf-help')"
        >
          <UButton
            :color="app ? 'neutral' : 'primary'"
            :variant="app ? 'outline' : 'solid'"
            icon="i-lucide-file-pen-line"
            :label="t('core.access.review.start-behalf')"
            :to="`/console/people/access-scheme/${encodeURIComponent(id)}/apply`"
          />
        </PageSection>

        <PageSection
          v-if="data?.history?.length"
          :title="t('core.access.review.history')"
        >
          <ul class="space-y-1 text-sm">
            <li
              v-for="(entry, i) in data?.history ?? []"
              :key="i"
            >
              {{ t('core.access.review.history-line', { date: day(entry.at), what: t(`core.access.review.event.${entry.event}`), by: entry.by ?? t('core.access.review.someone') }) }}
            </li>
          </ul>
        </PageSection>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
