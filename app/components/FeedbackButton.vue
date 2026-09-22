<script setup lang="ts">
import { FEEDBACK_BODY_MAX, FEEDBACK_BODY_MIN, FEEDBACK_KINDS, FEEDBACK_KIND_LABELS } from '#shared/utils/feedback'
import type { FeedbackKind, FeedbackShell, RecentFailure } from '#shared/utils/feedback'

// One button in the two operational shells: two taps and some words become a row for the daily
// triage run (K-134). Nothing renders for a visitor with no session (criterion 1).
const props = defineProps<{ shell: FeedbackShell }>()

const { account } = useAccount()
const route = useRoute()
const toast = useToast()
const failures = useState<RecentFailure[]>('nnt-recent-failures', () => [])

const open = ref(false)
const kind = ref<FeedbackKind>('BUG')
const body = ref('')
const failure = ref<string | null>(null)
const saving = ref(false)

const kinds = FEEDBACK_KINDS.map(id => ({ id, label: FEEDBACK_KIND_LABELS[id] }))
const ready = computed(() => body.value.trim().length >= FEEDBACK_BODY_MIN)

async function submit(): Promise<void> {
  saving.value = true
  failure.value = null
  try {
    await $fetch('/api/feedback', {
      method: 'POST',
      body: {
        kind: kind.value,
        body: body.value.trim(),
        path: route.path,
        shell: props.shell,
        userAgent: navigator.userAgent.slice(0, 300),
        recentFailures: failures.value,
      },
    })
    toast.add({ title: 'Thanks, we have it', description: 'The IT Manager looks at reports every day.', icon: 'i-lucide-check', color: 'success' })
    open.value = false
    body.value = ''
    kind.value = 'BUG'
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UButton
    v-if="account.signedIn"
    icon="i-lucide-megaphone"
    variant="ghost"
    color="neutral"
    aria-label="Report a problem or share an idea"
    data-test="feedback-open"
    @click="open = true"
  />

  <UModal
    v-model:open="open"
    title="Report a problem or share an idea"
    description="It goes to the IT Manager with the name of this screen. Say what you did, what you expected and what happened instead."
  >
    <template #body>
      <UAlert
        v-if="failure"
        data-test="feedback-failure"
        color="error"
        variant="subtle"
        :description="failure"
        class="mb-4"
      />
      <div
        data-test="feedback-kind"
        class="mb-4 flex flex-wrap gap-2"
      >
        <UButton
          v-for="item in kinds"
          :key="item.id"
          size="sm"
          :color="kind === item.id ? 'primary' : 'neutral'"
          :variant="kind === item.id ? 'solid' : 'subtle'"
          class="min-h-10"
          :data-test="`feedback-kind-${item.id}`"
          @click="kind = item.id"
        >
          {{ item.label }}
        </UButton>
      </div>
      <UFormField
        :label="kind === 'BUG' ? 'What happened' : 'What would help'"
        :hint="`${FEEDBACK_BODY_MIN} to ${FEEDBACK_BODY_MAX} characters`"
      >
        <UTextarea
          v-model="body"
          :rows="5"
          :maxlength="FEEDBACK_BODY_MAX"
          class="w-full"
          data-test="feedback-body"
        />
      </UFormField>

      <div class="mt-4 flex flex-wrap gap-2">
        <UButton
          data-test="feedback-submit"
          :loading="saving"
          :disabled="!ready"
          @click="submit"
        >
          Send
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="open = false"
        >
          {{ CONFIRM_BACK_LABEL }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
