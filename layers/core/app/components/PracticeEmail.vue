<!-- One would-be email from the practice outbox (PM-S8, PM-14): rendered as the theatre's real email,
     under the line that says it was not sent. The email is drawn in a sandboxed frame, so its markup
     can neither run nor reach the page. -->
<script setup lang="ts">
const props = defineProps<{ id: string | null }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useT()
const { time } = useDates()
const { $api } = useNuxtApp()
const email = ref<{ to: string, subject: string | null, html: string | null, text: string | null, at: number } | null>(null)

watch(() => props.id, async (id) => {
  email.value = null
  if (id) email.value = await $api(`/api/core/practice/outbox/${encodeURIComponent(id)}`)
}, { immediate: true })
</script>

<template>
  <UModal
    :open="id !== null"
    :title="email?.subject ?? t('core.practice.panel.no-subject')"
    :description="email ? t('core.practice.panel.to', { to: email.to, time: time(email.at) }) : undefined"
    :ui="{ content: 'sm:max-w-2xl' }"
    @update:open="(value: boolean) => { if (!value) emit('close') }"
  >
    <template #body>
      <div class="flex flex-col gap-3">
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-mail-x"
          :title="t('core.practice.not-sent')"
        />
        <USkeleton
          v-if="!email"
          class="h-64 w-full"
        />
        <iframe
          v-else-if="email.html"
          :srcdoc="email.html"
          sandbox=""
          :title="email.subject ?? t('core.practice.panel.no-subject')"
          class="h-[60svh] w-full rounded-md border border-default bg-white"
        />
        <pre
          v-else
          class="text-sm whitespace-pre-wrap"
        >{{ email.text }}</pre>
      </div>
    </template>
  </UModal>
</template>
