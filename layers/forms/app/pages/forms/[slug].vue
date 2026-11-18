<!-- A form as the person answering it sees it (FB-302, FB-303): one page at a time, with what is
     wrong said beside each answer. If it cannot be answered, only why, and what would let them
     through. Someone signed in has their answers kept as they go and finds them on any device;
     someone signed out has them kept on this device for a week, unless the form asks for something
     too private to leave on a device. -->
<script setup lang="ts">
import type { Answers, Definition } from '../../../shared/engine'
import { questionsOf } from '../../../shared/engine'
import { newResponseId } from '../../../shared/response-id'

interface Open {
  formId: string
  slug: string
  title: string
  anonymous: boolean
  signedIn: boolean
  opensAt: number | null
  closesAt: number | null
  state: 'open' | 'paused' | 'not-yet' | 'closed' | 'full' | 'sign-in' | 'answered'
  reason?: string
  remedy?: string
  definition: Definition | null
  today: string | null
  asksEmail: boolean
  draft: { responseId: string, answers: Answers, pageId: string | null } | null
  about: { slot: string, label: string, name: string | null } | null
}
interface Kept { responseId: string, answers: Answers, pageId: string | null, email: string, at: number }

definePageMeta({ key: 'forms-answer' })
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { dateTime } = useDates()
const route = useRoute()
const slug = computed(() => String(route.params.slug))

// A form attached to another module's record is answered at the same address, with the place named.
const place = computed(() => typeof route.query.place === 'string' ? route.query.place : '')
const at = computed(() => place.value ? `?place=${encodeURIComponent(place.value)}` : '')

const { data, error, refresh } = await useAPI<Open>(() => `/api/forms/open/${encodeURIComponent(slug.value)}${at.value}`, { key: `forms:open:${slug.value}:${place.value}` })
if (error.value || !data.value) throw createError({ statusCode: 404, statusMessage: t('forms.screens.answer.not-found'), fatal: true })
// An address the form used to have: on to where it is now, with whatever else the link carried.
const movedTo = (data.value as { movedTo?: string }).movedTo
if (movedTo) await navigateTo(`/forms/${encodeURIComponent(movedTo)}${at.value}`, { redirectCode: 301, external: true }) // not-policy: HTTP status
const form = computed(() => data.value!)
provide('forms:answering', slug)

const responseId = ref(form.value.draft?.responseId ?? newResponseId())
// File answers are uploaded into this response as they are chosen.
provideFormsUploads(slug, responseId, place)
const answers = ref<Answers>(form.value.draft?.answers ?? {})
const pageId = ref<string | null>(form.value.draft?.pageId ?? null)
const email = ref('')
const emailError = ref<string>()
const emailBox = useTemplateRef<HTMLElement>('emailBox')
const challenge = ref('')
const failure = ref<{ reason: string, remedy?: string } | null>(null)
const reference = ref('')

// ---- keeping answers ----
const KEEP_FOR = 7 * 86_400_000 // not-policy: the interface specification's limit for a draft kept on a device
const storageKey = computed(() => `forms:answers:${slug.value}${place.value ? `:${place.value}` : ''}`)
const hasSpecial = computed(() => form.value.definition ? questionsOf(form.value.definition).some(({ question }) => question.dataClass === 'special') : false)
/** Where answers so far are kept: with the account, on this device, or nowhere. */
const keeping = computed(() => form.value.state !== 'open' ? 'none' : form.value.signedIn && !form.value.anonymous ? 'account' : hasSpecial.value ? 'none' : 'device')
const saved = ref<'idle' | 'saving' | 'saved' | 'failed'>('idle')

onMounted(() => {
  if (keeping.value !== 'device') return
  try {
    const kept = JSON.parse(localStorage.getItem(storageKey.value) ?? 'null') as Kept | null
    if (!kept || Date.now() - kept.at > KEEP_FOR) return localStorage.removeItem(storageKey.value)
    responseId.value = kept.responseId
    answers.value = kept.answers
    pageId.value = kept.pageId
    email.value = kept.email
  }
  catch {
    // Storage is off or what it holds is not ours: start afresh.
  }
})

let timer: ReturnType<typeof setTimeout> | undefined
async function keep() {
  if (reference.value) return
  if (keeping.value === 'device') {
    try {
      localStorage.setItem(storageKey.value, JSON.stringify({ responseId: responseId.value, answers: answers.value, pageId: pageId.value, email: email.value, at: Date.now() } satisfies Kept))
    }
    catch {
      // Storage is full or off: the answers stay on the page.
    }
    return
  }
  if (keeping.value !== 'account') return
  saved.value = 'saving'
  try {
    const kept = await $api<{ responseId: string }>(`/api/forms/open/${encodeURIComponent(slug.value)}/draft${at.value}` as string, { method: 'PUT', body: { responseId: responseId.value, answers: answers.value, pageId: pageId.value } })
    responseId.value = kept.responseId
    saved.value = 'saved'
  }
  catch {
    saved.value = 'failed'
  }
}
watch([answers, pageId, email], () => {
  clearTimeout(timer)
  timer = setTimeout(keep, 1200) // not-policy: a pause in typing
}, { deep: true })
onBeforeUnmount(() => clearTimeout(timer))

// ---- sending ----
/** The address is asked for beside the form, so it is checked with each page rather than only at the end. */
function emailGiven(): boolean {
  emailError.value = undefined
  if (!form.value.asksEmail || /^\S+@\S+\.\S+$/.test(email.value.trim())) return true
  emailError.value = t('forms.screens.answer.email-needed')
  nextTick(() => emailBox.value?.querySelector('input')?.focus())
  return false
}
async function send(kept: Answers): Promise<boolean> {
  failure.value = null
  if (!emailGiven()) return false
  clearTimeout(timer)
  try {
    const sent = await $api<{ reference: string }>(`/api/forms/open/${encodeURIComponent(slug.value)}/responses${at.value}` as string, {
      method: 'POST',
      body: { responseId: responseId.value, answers: kept, ...(form.value.asksEmail ? { email: email.value.trim() } : {}) },
      headers: challenge.value ? { 'cf-turnstile-response': challenge.value } : {},
    })
    reference.value = sent.reference
    try {
      localStorage.removeItem(storageKey.value)
    }
    catch {
      // Nothing was kept.
    }
    return true
  }
  catch (e) {
    const refusal = toRefusal(e)
    failure.value = { reason: refusal.reason, remedy: refusal.remedy }
    if (refusal.fields?.email) emailError.value = refusal.reason
    // The form closed or filled while they were answering: show the page as it now stands.
    if (refusal.code.startsWith('forms.link.')) await refresh()
    return false
  }
}
</script>

<template>
  <PageFrame
    :title="form.title"
    :description="form.about?.name ? `${t(form.about.label)}: ${form.about.name}` : undefined"
    width="reading"
  >
    <EmptyState
      v-if="form.state !== 'open'"
      :icon="form.state === 'sign-in' ? 'i-lucide-log-in' : form.state === 'answered' ? 'i-lucide-circle-check' : 'i-lucide-clock'"
      :title="t(`forms.screens.answer.shut.${form.state}`)"
      :description="form.state === 'not-yet' && form.opensAt ? t('forms.screens.answer.opens', { when: dateTime(form.opensAt) }) : t(`forms.screens.answer.remedy.${form.state}`)"
    >
      <template #actions>
        <UButton
          v-if="form.state === 'sign-in'"
          :label="t('forms.screens.answer.sign-in')"
          :to="`/sign-in?next=${encodeURIComponent(route.fullPath)}`"
          external
        />
        <UButton
          v-else-if="form.state === 'answered'"
          :label="t('forms.navigation.mine.label')"
          to="/account/forms"
          color="neutral"
          variant="subtle"
        />
      </template>
    </EmptyState>

    <div
      v-else-if="form.definition"
      class="space-y-6"
    >
      <p
        v-if="!reference"
        class="text-sm text-muted"
        aria-live="polite"
      >
        <template v-if="keeping === 'account'">
          {{ saved === 'failed' ? t('forms.screens.answer.keep.failed') : saved === 'saved' ? t('forms.screens.answer.keep.saved') : t('forms.screens.answer.keep.account') }}
        </template>
        <template v-else-if="keeping === 'device'">
          {{ t('forms.screens.answer.keep.device') }}
        </template>
        <template v-else>
          {{ form.anonymous ? t('forms.screens.answer.keep.anonymous') : t('forms.screens.answer.keep.none') }}
        </template>
        <template v-if="form.closesAt">
          {{ t('forms.screens.answer.closes', { when: dateTime(form.closesAt) }) }}
        </template>
      </p>
      <div
        v-if="form.asksEmail && !reference"
        ref="emailBox"
      >
        <UFormField
          :label="t('forms.screens.answer.email')"
          :help="t('forms.screens.answer.email-help')"
          :error="emailError"
          required
        >
          <UInput
            v-model="email"
            type="email"
            autocomplete="email"
          />
        </UFormField>
      </div>
      <UAlert
        v-if="failure"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="failure.reason"
        :description="failure.remedy"
      />
      <FormsFill
        v-model="answers"
        :definition="form.definition"
        :context="{ today: form.today ?? '' }"
        :send="send"
        :check="emailGiven"
        :start="pageId"
        @page="pageId = $event"
      >
        <template #ended="{ ending }">
          <p
            v-if="reference && (ending === 'sent' || ending.submits)"
            class="text-muted"
          >
            {{ t('forms.screens.answer.reference', { reference }) }}
          </p>
          <UButton
            v-if="reference && form.signedIn && !form.anonymous"
            :label="t('forms.navigation.mine.label')"
            to="/account/forms"
            color="neutral"
            variant="subtle"
          />
        </template>
      </FormsFill>
      <TurnstileCheck
        v-if="!reference"
        @token="challenge = $event"
      />
    </div>
  </PageFrame>
</template>
