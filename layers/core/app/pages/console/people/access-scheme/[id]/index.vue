<!-- One application to the access scheme (ID-40 to ID-42; identity spec part 6): what the person
     asked for, what is in force, what has happened to it, and the reviewer's actions: accept, reject,
     ask for more, verify, and a way to apply on their behalf (the form is [id]/apply). Opening it is recorded; nobody opens their own. -->
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
  needs: { id: string, label: string, retired: boolean }[]
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
const labelOf = (term: string) => data.value?.needs.find(n => n.id === term)?.label ?? t('core.access.retired-need')
const day = (ms: number) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(ms)

const STATUS = {
  'submitted': { tone: 'info', key: 'core.access.review.status.submitted' },
  'more-info': { tone: 'warning', key: 'core.access.review.status.more-info' },
  'accepted': { tone: 'success', key: 'core.access.review.status.accepted' },
  'rejected': { tone: 'danger', key: 'core.access.review.status.rejected' },
} as const

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
const actions = computed(() => [
  { value: 'accept', label: t('core.access.review.accept') },
  { value: 'ask', label: t('core.access.review.ask') },
  { value: 'reject', label: t('core.access.review.reject') },
])
const companionChoices = computed(() => Array.from({ length: (app.value?.pending?.companions ?? 0) + 1 }, (_, n) => ({ value: n, label: t(`core.access.form.companions-${n}`) })))
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
                :tone="STATUS[app.status].tone"
                :label="t(STATUS[app.status].key)"
              />
              <StatusBadge
                v-if="app.status === 'accepted' && app.pending"
                tone="info"
                :label="t('core.access.review.change-waiting')"
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
              {{ part === 'pending' ? t('core.access.asked') : t('core.access.in-force') }}
            </h2>
            <template v-if="app[part]">
              <ul class="list-disc space-y-1 ps-5">
                <li
                  v-for="need in app[part]!.needs"
                  :key="need.term"
                >
                  {{ labelOf(need.term) }}<span
                    v-if="need.note"
                    class="text-muted"
                  > ({{ need.note }})</span>
                </li>
              </ul>
              <p>{{ t('core.access.companions', { count: app[part]!.companions }) }}</p>
              <p
                v-if="app[part]!.other"
                class="whitespace-pre-line"
              >
                {{ app[part]!.other }}
              </p>
            </template>
          </section>

          <UAlert
            v-if="app.message"
            color="neutral"
            variant="outline"
            icon="i-lucide-message-square"
            :title="t('core.access.review.last-message')"
            :description="app.message"
          />

          <!-- Decide, when something is waiting. -->
          <section
            v-if="app.pending && app.status !== 'more-info'"
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
                orientation="horizontal"
              />
              <UFormField
                v-if="decision.action === 'accept'"
                :label="t('core.access.form.companions')"
                :help="t('core.access.review.companions-help')"
              >
                <USelect
                  v-model="decision.companions"
                  :items="companionChoices"
                />
              </UFormField>
              <UFormField
                :label="decision.action === 'ask' ? t('core.access.review.question') : t('core.access.review.message')"
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

        <!-- Apply, or answer, on their behalf. -->
        <section
          aria-labelledby="application-behalf"
          class="space-y-3"
        >
          <h2
            id="application-behalf"
            class="text-lg font-semibold text-highlighted"
          >
            {{ t('core.access.review.behalf') }}
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
