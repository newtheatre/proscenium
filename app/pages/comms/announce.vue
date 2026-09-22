<script setup lang="ts">
import { AUDIENCE_KINDS, AUDIENCE_LABELS, saysAnnouncementSent, saysAudienceCount } from '#shared/utils/announcements'
import { ROLES, saysRole } from '#shared/utils/roles'
import type { AudienceKind } from '#shared/utils/announcements'

definePageMeta({ layout: 'console', title: 'Announce', middleware: 'console', docs: '/docs/communications/announcements' })

const toast = useToast()

const kind = ref<AudienceKind>('ALL_CURRENT_MEMBERS')
const role = ref<(typeof ROLES)[number] | undefined>(undefined)
const sessionId = ref<string | undefined>(undefined)
const subject = ref('')
const body = ref('')
const safetyNotice = ref(false)

const failure = ref<string | null>(null)
const previewing = ref(false)
const sending = ref(false)
const preview = ref<{ count: number, rendered: { subject: string, text: string } } | null>(null)
const sent = ref<{ count: number, held: number } | null>(null)

const audience = computed(() => {
  if (kind.value === 'ROLE_HOLDERS') return { kind: kind.value, role: role.value }
  if (kind.value === 'SESSION_SIGNUPS') return { kind: kind.value, sessionId: sessionId.value ?? '' }
  return { kind: kind.value }
})

const audienceReady = computed(() =>
  (kind.value !== 'ROLE_HOLDERS' || Boolean(role.value))
  && (kind.value !== 'SESSION_SIGNUPS' || Boolean(sessionId.value)))

const request = useRequestFetch()

// Answered from the audience alone, so the count is on screen before a word is written
// (criterion 7). Never cached: an audience is resolved from live data every time it is asked.
const { data: counted, status: countStatus } = await useAsyncData(
  () => `announce-audience-${JSON.stringify(audience.value)}`,
  () => (audienceReady.value
    ? request<{ count: number }>('/api/admin/comms/announcements/audience', { query: audience.value })
    : Promise.resolve(null)),
  { watch: [audience], default: (): { count: number } | null => null, getCachedData: () => undefined },
)

const ready = computed(() =>
  subject.value.trim().length > 0
  && body.value.trim().length > 0
  && (kind.value !== 'ROLE_HOLDERS' || role.value)
  && (kind.value !== 'SESSION_SIGNUPS' || Boolean(sessionId.value)))

// A fresh count and rendering every time the message or the audience changes: a stale preview
// naming yesterday's audience is worse than none (criterion 4).
watch([kind, role, sessionId, subject, body, safetyNotice], () => {
  preview.value = null
  sent.value = null
})

async function runPreview(): Promise<void> {
  if (!ready.value) return
  previewing.value = true
  failure.value = null
  try {
    preview.value = await $fetch('/api/admin/comms/announcements/preview', {
      method: 'POST',
      body: { audience: audience.value, subject: subject.value, body: body.value, safetyNotice: safetyNotice.value },
    })
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    previewing.value = false
  }
}

function startAnother(): void {
  subject.value = ''
  body.value = ''
  safetyNotice.value = false
  sent.value = null
  preview.value = null
}

async function send(): Promise<void> {
  if (!preview.value) return
  sending.value = true
  failure.value = null
  try {
    const result = await $fetch<{ count: number, held: number }>('/api/admin/comms/announcements', {
      method: 'POST',
      body: { audience: audience.value, subject: subject.value, body: body.value, safetyNotice: safetyNotice.value },
    })
    toast.add({
      title: saysAnnouncementSent(result.count, result.held),
      icon: result.held > 0 ? 'i-lucide-clock' : 'i-lucide-send',
      color: 'success',
    })
    // The draft stays on screen: an officer reads back what went out, and starts the next one
    // deliberately rather than finding the form emptied under them (criterion 7).
    sent.value = { count: result.count, held: result.held }
    preview.value = null
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl space-y-6">
    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <UFormField label="Audience">
      <USelect
        v-model="kind"
        data-test="audience-kind"
        :items="AUDIENCE_KINDS.map(value => ({ label: AUDIENCE_LABELS[value], value }))"
        value-key="value"
        class="w-full"
      />
    </UFormField>

    <UFormField
      v-if="kind === 'ROLE_HOLDERS'"
      label="Role"
    >
      <USelect
        v-model="role"
        data-test="audience-role"
        :items="ROLES.map(value => ({ label: saysRole(value), value }))"
        value-key="value"
        class="w-full"
      />
    </UFormField>

    <UFormField
      v-if="kind === 'SESSION_SIGNUPS'"
      label="Session"
    >
      <SessionPicker v-model="sessionId" />
    </UFormField>

    <p
      class="text-sm text-muted"
      data-test="audience-count"
    >
      <template v-if="countStatus === 'pending'">
        Counting the audience
      </template>
      <template v-else-if="counted">
        {{ saysAudienceCount(counted.count) }}
      </template>
      <template v-else>
        Choose who it is for to see how many that is.
      </template>
    </p>

    <UAlert
      v-if="sent"
      data-test="announce-sent"
      color="success"
      variant="subtle"
      :icon="sent.held > 0 ? 'i-lucide-clock' : 'i-lucide-send'"
      :title="saysAnnouncementSent(sent.count, sent.held)"
      :description="sent.held > 0
        ? 'Each one has an inbox entry now; the email goes out with the next announcements digest.'
        : 'What went out is below, exactly as it was sent.'"
    >
      <template #actions>
        <UButton
          data-test="announce-again"
          color="neutral"
          variant="outline"
          @click="startAnother"
        >
          Write another announcement
        </UButton>
      </template>
    </UAlert>

    <UFormField label="Subject">
      <UInput
        v-model="subject"
        data-test="announce-subject"
      />
    </UFormField>

    <UFormField label="Message">
      <UTextarea
        v-model="body"
        data-test="announce-body"
        :rows="8"
        class="w-full"
      />
    </UFormField>

    <UCheckbox
      v-model="safetyNotice"
      data-test="announce-safety"
      label="This is a safety notice"
      description="Reaches the audience regardless of their announcement preference, the same as a ticket or a refund does."
    />

    <div class="flex flex-wrap items-center gap-3">
      <UButton
        data-test="announce-preview"
        color="neutral"
        variant="subtle"
        :loading="previewing"
        :disabled="!ready"
        @click="runPreview"
      >
        Preview
      </UButton>
      <UButton
        v-if="preview"
        data-test="announce-send"
        :loading="sending"
        @click="send"
      >
        Send to {{ plural(preview.count, 'recipient') }}
      </UButton>
    </div>

    <div
      v-if="preview"
      class="rounded border p-4 space-y-2"
      data-test="announce-preview-card"
    >
      <p class="text-sm text-muted">
        {{ plural(preview.count, 'recipient') }}, resolved just now from live data.
      </p>
      <p class="font-semibold">
        {{ preview.rendered.subject }}
      </p>
      <p class="whitespace-pre-line text-sm">
        {{ preview.rendered.text }}
      </p>
    </div>
  </div>
</template>
