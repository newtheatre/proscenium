<!-- The access scheme's application form in My account (ID-38; identity spec part 6): a first
     application, an answer to the reviewer's question, or a change. It starts from what was sent
     before. When a reviewer has asked a question, the page opens on the question with a box for the
     answer, and a link to change the application as well. With the scheme off it is a missing page.
     Opened with `?next=` (say from choosing tickets), sending it returns the person there; otherwise to
     where their application stands. -->
<script setup lang="ts">
import { z } from 'zod'
import type { AccessApplicationValue } from '../../../composables/useAccessApplicationForm'
import type { RefusalView } from '../../../utils/refusal'

interface Mine {
  enabled: boolean
  name?: string
  allowNote?: boolean
  needs?: { id: string, key: string, label: string, description: string | null }[]
  application?: {
    status: 'submitted' | 'more-info' | 'accepted' | 'rejected'
    inForce: AccessApplicationValue | null
    pending: AccessApplicationValue | null
    message: string | null
  } | null
}

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const route = useRoute()
const router = useRouter()
const returnTo = nextPath(route.query.next) ?? '/account/access'
const { data } = await useAPI<Mine>('/api/core/me/access', { key: 'core:my-access' })
if (!data.value?.enabled) throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })

const application = computed(() => data.value?.application ?? null)
const asked = computed(() => application.value?.status === 'more-info')
// The short answer view, until the person chooses to change the application too.
const answerOnly = computed(() => asked.value && route.query.change === undefined)
const { schema, fields, toForm, toBody } = useAccessApplicationForm(() => data.value?.needs ?? [], () => !!data.value?.allowNote, asked)
const initial = toForm(application.value?.status === 'rejected' ? null : (application.value?.pending ?? application.value?.inForce))
useSeoMeta({ title: () => data.value?.name ?? '' })

async function submit(values: Record<string, unknown>) {
  await $api('/api/core/me/access', { method: 'POST', body: toBody(values) })
  toast.add({ title: asked.value ? t('core.access.answer.sent') : t('core.access.sent'), color: 'success' })
  await refreshNuxtData('core:my-access')
}

// Answering alone: the application is sent back as it stands, with the answer.
const answerSchema = z.object({ answer: z.string().trim().min(1, t('core.access.answer.needed')).max(1000) }) // not-policy: the server's bound on an answer
const answer = reactive({ answer: '' })
const busy = ref(false)
const refusal = ref<RefusalView | null>(null)
async function sendAnswer() {
  busy.value = true
  refusal.value = null
  try {
    await submit({ ...initial, answer: answer.answer })
    await router.push('/account/access')
  }
  catch (error) {
    refusal.value = toRefusal(error)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <PageFrame
    v-if="answerOnly"
    :title="t('core.access.answer.title')"
    width="reading"
  >
    <div class="space-y-6">
      <RefusalNotice :refusal="refusal" />
      <UAlert
        color="warning"
        variant="subtle"
        icon="i-lucide-message-square"
        :title="t('core.access.answer.question')"
        :description="application?.message ?? ''"
      />
      <UForm
        :schema="answerSchema"
        :state="answer"
        class="space-y-4"
        novalidate
        @submit="sendAnswer"
      >
        <UFormField
          name="answer"
          :label="t('core.access.answer.label')"
        >
          <UTextarea
            v-model="answer.answer"
            :rows="5"
            :maxlength="1000"
          />
        </UFormField>
        <div class="flex flex-wrap items-center gap-4">
          <UButton
            type="submit"
            :loading="busy"
            :label="t('core.access.answer.send')"
          />
          <UButton
            color="neutral"
            variant="link"
            :label="t('core.access.answer.change')"
            :to="{ path: '/account/access/apply', query: { change: '1' } }"
          />
        </div>
        <p class="text-sm text-muted">
          {{ t('core.access.answer.change-help') }}
        </p>
      </UForm>
    </div>
  </PageFrame>
  <PageForm
    v-else
    :title="data?.name ?? ''"
    :description="asked && application?.message ? `${t('core.access.answer.question')}: ${application.message}` : t('core.access.form.who-reads-detail')"
    :submit-label="asked ? t('core.access.answer.send') : application && application.status !== 'rejected' ? t('core.access.form.send-change') : t('core.access.form.send')"
    :schema="schema"
    :fields="fields"
    :initial="initial"
    :submit="submit"
    :return-to="returnTo"
  />
</template>
