<script setup lang="ts">
import { AUDIENCE_KINDS, AUDIENCE_LABELS } from '#shared/utils/announcements'
import { ROLES } from '#shared/utils/roles'
import type { AudienceKind } from '#shared/utils/announcements'

definePageMeta({ layout: 'console', title: 'Announce', middleware: 'console' })

const toast = useToast()

const kind = ref<AudienceKind>('ALL_CURRENT_MEMBERS')
const role = ref<(typeof ROLES)[number] | undefined>(undefined)
const sessionId = ref('')
const subject = ref('')
const body = ref('')
const safetyNotice = ref(false)

const failure = ref<string | null>(null)
const previewing = ref(false)
const sending = ref(false)
const preview = ref<{ count: number, rendered: { subject: string, text: string } } | null>(null)

const audience = computed(() => {
  if (kind.value === 'ROLE_HOLDERS') return { kind: kind.value, role: role.value }
  if (kind.value === 'SESSION_SIGNUPS') return { kind: kind.value, sessionId: sessionId.value }
  return { kind: kind.value }
})

const ready = computed(() =>
  subject.value.trim().length > 0
  && body.value.trim().length > 0
  && (kind.value !== 'ROLE_HOLDERS' || role.value)
  && (kind.value !== 'SESSION_SIGNUPS' || sessionId.value.trim().length > 0))

// A fresh count and rendering every time the message or the audience changes: a stale preview
// naming yesterday's audience is worse than none (criterion 4).
watch([kind, role, sessionId, subject, body, safetyNotice], () => {
  preview.value = null
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

async function send(): Promise<void> {
  if (!preview.value) return
  sending.value = true
  failure.value = null
  try {
    const result = await $fetch<{ count: number }>('/api/admin/comms/announcements', {
      method: 'POST',
      body: { audience: audience.value, subject: subject.value, body: body.value, safetyNotice: safetyNotice.value },
    })
    toast.add({
      title: `Sent to ${plural(result.count, 'recipient')}`,
      icon: 'i-lucide-send',
      color: 'success',
    })
    subject.value = ''
    body.value = ''
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
        :items="[...ROLES]"
        class="w-full"
      />
    </UFormField>

    <UFormField
      v-if="kind === 'SESSION_SIGNUPS'"
      label="Session ID"
      description="From the training session's own screen."
    >
      <UInput
        v-model="sessionId"
        data-test="audience-session"
      />
    </UFormField>

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
