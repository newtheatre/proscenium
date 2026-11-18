<!-- One of the person's own responses (FB-304): everything they answered, as they answered it, and
     where it is now in the form's own words for them. While it is back with them for changes
     (FB-404) they change their answers here and send them again; what they sent before stays as
     it was for the theatre to compare. -->
<script setup lang="ts">
import type { Answers, Definition } from '../../../../shared/engine'
import type { ShownAnswer } from '../../../components/FormsAnswers.vue'

interface Own {
  response: { id: string, reference: string, submittedAt: number }
  form: { title: string, slug: string }
  definition: Definition
  answers: ShownAnswer[]
  calculated?: Record<string, string | number | null> | null
  values: Answers | null
  progress: { status: string, kind: string, note: string | null, canChange: boolean } | null
  today: string
}
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { dateTime } = useDates()
const toast = useToast()
const route = useRoute()
const { data, error, refresh } = await useAPI<Own>(() => `/api/forms/mine/${encodeURIComponent(String(route.params.id))}`, { key: `forms:mine:${route.params.id}` })
if (error.value || !data.value) throw createError({ statusCode: 404, statusMessage: t('forms.screens.answer.not-found'), fatal: true })
const own = computed(() => data.value!)

const changing = ref(false)
const answers = ref<Answers>({})
const failure = ref<{ reason: string, remedy?: string } | null>(null)
function start() {
  answers.value = JSON.parse(JSON.stringify(own.value.values ?? {})) as Answers
  failure.value = null
  changing.value = true
}
async function send(kept: Answers): Promise<boolean> {
  failure.value = null
  try {
    await $api(`/api/forms/mine/${encodeURIComponent(own.value.response.id)}` as string, { method: 'PUT', body: { answers: kept } })
  }
  catch (e) {
    const refusal = toRefusal(e)
    failure.value = { reason: refusal.reason, remedy: refusal.remedy }
    return false
  }
  toast.add({ title: t('forms.screens.mine.changes-sent'), color: 'success' })
  changing.value = false
  await refresh()
  return false
}
</script>

<template>
  <PageFrame
    :title="own.form.title"
    :description="t('forms.screens.mine.sent-on', { when: dateTime(own.response.submittedAt), reference: own.response.reference })"
    :trail="[{ label: t('forms.navigation.mine.label'), to: '/account/forms' }]"
    width="reading"
  >
    <template
      v-if="own.progress"
      #status
    >
      <StatusBadge
        :tone="formsStageTone(own.progress.kind)"
        :label="own.progress.status"
      />
    </template>
    <div class="space-y-6">
      <UAlert
        v-if="own.progress?.canChange && !changing"
        color="warning"
        variant="subtle"
        icon="i-lucide-undo-2"
        :title="t('forms.screens.mine.returned')"
        :description="own.progress.note || t('forms.screens.mine.returned-help')"
        :actions="[{ label: t('forms.screens.mine.change'), color: 'neutral', variant: 'solid', onClick: start }]"
      />
      <UAlert
        v-else-if="own.progress?.note && !changing"
        color="neutral"
        variant="subtle"
        icon="i-lucide-message-square"
        :title="t('forms.screens.mine.note')"
        :description="own.progress.note"
      />
      <template v-if="changing">
        <UAlert
          v-if="own.progress?.note"
          color="neutral"
          variant="subtle"
          icon="i-lucide-message-square"
          :title="t('forms.screens.mine.note')"
          :description="own.progress.note"
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
          :definition="own.definition"
          :context="{ today: own.today }"
          :send="send"
          :send-label="t('forms.screens.mine.send-changes')"
        />
        <UButton
          :label="t('forms.screens.mine.keep')"
          color="neutral"
          variant="ghost"
          @click="changing = false"
        />
      </template>
      <FormsAnswers
        v-else
        :definition="own.definition"
        :answers="own.answers"
        :calculated="own.calculated"
        placed-only
      />
    </div>
  </PageFrame>
</template>
