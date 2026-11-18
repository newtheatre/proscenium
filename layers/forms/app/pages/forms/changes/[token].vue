<!-- A response somebody answered signed out, opened through the link they were emailed when it was
     returned for changes (R-19): what they sent, the note to them, and, while it is back with them,
     their answers to change and send again. The link may be opened as often as they like; sending
     the changes spends it. -->
<script setup lang="ts">
import type { Answers, Definition } from '../../../../shared/engine'
import type { ShownAnswer } from '../../../components/FormsAnswers.vue'

interface Opened {
  response: { reference: string, submittedAt: number }
  form: { title: string }
  definition: Definition
  answers: ShownAnswer[]
  values: Answers | null
  progress: { status: string, kind: string, note: string | null, canChange: boolean } | null
  expiresAt: number
  today: string
}
definePageMeta({ key: 'forms-changes' })
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { dateTime } = useDates()
const route = useRoute()
const token = computed(() => String(route.params.token))
const { data } = await useAPI<Opened>(() => `/api/forms/changes/${encodeURIComponent(token.value)}`, { key: `forms:changes:${token.value}` })
useHead({ meta: [{ name: 'referrer', content: 'no-referrer' }, { name: 'robots', content: 'noindex' }] })

const changing = ref(false)
const answers = ref<Answers>({})
const challenge = ref('')
const failure = ref<{ reason: string, remedy?: string } | null>(null)
const sent = ref<{ reference: string, status: string } | null>(null)
function start() {
  answers.value = JSON.parse(JSON.stringify(data.value?.values ?? {})) as Answers
  failure.value = null
  changing.value = true
}
async function send(kept: Answers): Promise<boolean> {
  failure.value = null
  try {
    sent.value = await $api<{ reference: string, status: string }>(`/api/forms/changes/${encodeURIComponent(token.value)}` as string, {
      method: 'PUT',
      body: { answers: kept },
      headers: challenge.value ? { 'cf-turnstile-response': challenge.value } : {},
    })
  }
  catch (e) {
    const refusal = toRefusal(e)
    failure.value = { reason: refusal.reason, remedy: refusal.remedy }
    return false
  }
  changing.value = false
  return false
}
</script>

<template>
  <PageFrame
    :title="data?.form.title ?? t('forms.screens.changes.title')"
    :description="data ? t('forms.screens.mine.sent-on', { when: dateTime(data.response.submittedAt), reference: data.response.reference }) : undefined"
    width="reading"
  >
    <template
      v-if="data?.progress && !sent"
      #status
    >
      <StatusBadge
        :tone="formsStageTone(data.progress.kind)"
        :label="data.progress.status"
      />
    </template>
    <EmptyState
      v-if="sent"
      icon="i-lucide-circle-check"
      :title="t('forms.screens.changes.sent')"
      :description="t('forms.screens.changes.sent-help', { reference: sent.reference })"
    />
    <EmptyState
      v-else-if="!data"
      icon="i-lucide-link-2-off"
      :title="t('forms.screens.changes.not-found')"
      :description="t('forms.screens.changes.not-found-help')"
    />
    <div
      v-else
      class="space-y-6"
    >
      <UAlert
        v-if="data.progress?.canChange && !changing"
        color="warning"
        variant="subtle"
        icon="i-lucide-undo-2"
        :title="t('forms.screens.mine.returned')"
        :description="data.progress.note || t('forms.screens.mine.returned-help')"
        :actions="[{ label: t('forms.screens.mine.change'), color: 'neutral', variant: 'solid', onClick: start }]"
      />
      <p class="text-sm text-muted">
        {{ t('forms.screens.changes.expires', { when: dateTime(data.expiresAt) }) }}
      </p>
      <template v-if="changing">
        <UAlert
          v-if="data.progress?.note"
          color="neutral"
          variant="subtle"
          icon="i-lucide-message-square"
          :title="t('forms.screens.mine.note')"
          :description="data.progress.note"
        />
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
          :definition="data.definition"
          :context="{ today: data.today }"
          :send="send"
          :send-label="t('forms.screens.mine.send-changes')"
        />
        <TurnstileCheck @token="challenge = $event" />
        <UButton
          :label="t('forms.screens.mine.keep')"
          color="neutral"
          variant="ghost"
          @click="changing = false"
        />
      </template>
      <FormsAnswers
        v-else
        :definition="data.definition"
        :answers="data.answers"
      />
    </div>
  </PageFrame>
</template>
