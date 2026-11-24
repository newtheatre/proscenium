<!-- The practice card reader (PM-S7, PM-16): a sheet over the till while a payment waits on it. The
     trainee chooses what the card does from the scenario's outcomes, and the till then behaves as it
     does with the real reader's answer; "No answer" leaves the payment to the till's timeout path. -->
<script setup lang="ts">
import type { CardOutcome, PracticePanelData } from '../composables/usePractice'

const props = defineProps<{ waiting: PracticePanelData['waiting'][number] | null }>()

const { t } = useT()
const { $api } = useNuxtApp()
const choosing = ref<CardOutcome | null>(null)
const ICONS: Record<CardOutcome, string> = {
  'approved': 'i-lucide-circle-check',
  'declined': 'i-lucide-circle-x',
  'removed': 'i-lucide-credit-card',
  'no-answer': 'i-lucide-timer-off',
}

async function choose(outcome: CardOutcome) {
  if (!props.waiting) return
  choosing.value = outcome
  try {
    await $api(`/api/core/practice/calls/${encodeURIComponent(props.waiting.attemptId)}`, { method: 'POST', body: { outcome } })
  }
  finally {
    choosing.value = null
  }
}
</script>

<template>
  <UModal
    :open="waiting !== null"
    :dismissible="false"
    :close="false"
    :title="t('core.practice.reader.title')"
    :description="t('core.practice.reader.description')"
  >
    <template #body>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <UButton
          v-for="outcome in waiting?.outcomes ?? []"
          :key="outcome"
          :color="outcome === 'approved' ? 'primary' : 'neutral'"
          :variant="outcome === 'approved' ? 'solid' : 'outline'"
          size="xl"
          block
          class="min-h-16"
          :icon="ICONS[outcome]"
          :loading="choosing === outcome"
          :disabled="choosing !== null && choosing !== outcome"
          :label="t(`core.practice.reader.${outcome}`)"
          @click="choose(outcome)"
        />
      </div>
    </template>
  </UModal>
</template>
