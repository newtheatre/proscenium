<!-- One application to the access scheme (ID-40 to ID-42; identity spec part 6). It opens with where
     the application stands and what the reviewer should do next, then what the person is asking for
     and what is accepted now, the decision, verifying in person and the history. Filling the form in
     for them (the form is [id]/apply) is offered only when nothing is waiting for a decision: a
     first application for somebody new starts from the list. Opening it is recorded; nobody opens
     their own. -->
<script setup lang="ts">
import type { AccessApplicationValue } from '../../../../../composables/useAccessApplicationForm'
import type { RefusalView } from '../../../../../utils/refusal'

definePageMeta({ layout: 'console' })

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
const day = (ms: number) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(ms)

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
const decision = reactive<{ action: 'accept' | 'ask' | 'reject', companions: number, message: string }>({ action: 'accept', companions: 0, message: '' })
watch(() => app.value?.pending?.companions, (asked) => { decision.companions = asked ?? 0 }, { immediate: true })
const actions = computed(() => (['accept', 'ask', 'reject'] as const).map(a => ({
  value: a,
  label: t(`core.access.review.${a}`),
  description: t(`core.access.review.${a}-help`),
})))
const companionChoices = computed(() => Array.from({ length: (app.value?.pending?.companions ?? 0) + 1 }, (_, n) => ({ value: n, label: t(`core.access.form.companions-${n}`) })))
const messageLabel = computed(() => t(`core.access.review.message-for.${decision.action}`))
async function decide() {
  const body = decision.action === 'accept'
    ? { action: 'accept', companions: decision.companions, ...(decision.message.trim() ? { message: decision.message } : {}) }
    : { action: decision.action, message: decision.message }
  if (await act('/decision', 'POST', body, t('core.access.review.decided'))) decision.message = ''
}

// Verifying.
const method = ref<'access-card' | 'document' | 'known'>('access-card')
const methods = computed(() => (['access-card', 'document', 'known'] as const).map(m => ({ value: m, label: t(`core.access.review.method.${m}`) })))
</script>

<template>
  <PageFrame
    :title="data?.name ?? t('core.access.queue.unnamed')"
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

          <section
            v-for="part in (['pending', 'inForce'] as const)"
            v-show="app[part]"
            :key="part"
            :aria-labelledby="`application-${part}`"
            class="space-y-2"
          >
            <h2
              :id="`application-${part}`"
              class="text-lg font-semibold text-highlighted"
            >
              {{ part === 'inForce' ? t('core.access.review.in-force') : app.status === 'accepted' ? t('core.access.review.asked-change') : t('core.access.review.asked') }}
            </h2>
            <AccessApplicationSummary
              v-if="app[part]"
              :value="app[part]!"
              :needs="data?.needs ?? []"
            />
          </section>

          <UAlert
            v-if="app.message"
            color="neutral"
            variant="outline"
            icon="i-lucide-message-square"
            :title="app.status === 'more-info' ? t('core.access.review.question-sent') : t('core.access.review.last-message')"
            :description="app.message"
          />

          <!-- Decide, when something is waiting. -->
          <section
            v-if="waiting"
            aria-labelledby="application-decide"
            class="space-y-4"
          >
            <h2
              id="application-decide"
              class="text-lg font-semibold text-highlighted"
            >
              {{ t('core.access.review.decide') }}
            </h2>
            <form
              class="space-y-4"
              @submit.prevent="decide"
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
                :label="messageLabel"
                :hint="decision.action === 'accept' && decision.companions >= (app.pending?.companions ?? 0) ? t('core.access.form.optional') : undefined"
                :help="t('core.access.review.message-help')"
                :error="refusal?.fields?.message"
              >
                <UTextarea
                  v-model="decision.message"
                  :rows="3"
                  :maxlength="1000"
                  class="w-full"
                />
              </UFormField>
              <UButton
                type="submit"
                :loading="busy"
                :label="t(`core.access.review.do.${decision.action}`)"
              />
            </form>
          </section>

          <!-- Verify an accepted application in person. -->
          <section
            v-if="app.status === 'accepted'"
            aria-labelledby="application-verify"
            class="space-y-3"
          >
            <h2
              id="application-verify"
              class="text-lg font-semibold text-highlighted"
            >
              {{ t('core.access.review.verify') }}
            </h2>
            <p class="text-sm text-muted">
              {{ t('core.access.review.verify-help') }}
            </p>
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
          </section>
        </template>

        <!-- Fill the form in for them: only when nothing is waiting for a decision. -->
        <section
          v-if="behalf"
          aria-labelledby="application-behalf"
          class="space-y-3"
        >
          <h2
            id="application-behalf"
            class="text-lg font-semibold text-highlighted"
          >
            {{ t(`core.access.review.behalf.${behalf}`) }}
          </h2>
          <p class="text-sm text-muted">
            {{ t('core.access.review.behalf-help') }}
          </p>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-file-pen-line"
            :label="t('core.access.review.start-behalf')"
            :to="`/console/people/access-scheme/${encodeURIComponent(id)}/apply`"
          />
        </section>

        <section
          v-if="data?.history?.length"
          aria-labelledby="application-history"
          class="space-y-2"
        >
          <h2
            id="application-history"
            class="text-lg font-semibold text-highlighted"
          >
            {{ t('core.access.review.history') }}
          </h2>
          <ul class="space-y-1 text-sm">
            <li
              v-for="(entry, i) in data?.history ?? []"
              :key="i"
            >
              {{ t('core.access.review.history-line', { date: day(entry.at), what: t(`core.access.review.event.${entry.event}`), by: entry.by ?? t('core.access.review.someone') }) }}
            </li>
          </ul>
        </section>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
