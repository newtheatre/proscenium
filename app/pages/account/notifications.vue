<script setup lang="ts">
import { TOPIC_DESCRIPTIONS, TOPIC_LABELS } from '#shared/utils/notifications'
import type { NotificationTopic } from '#shared/utils/senders'

definePageMeta({ layout: 'member', middleware: 'signed-in', docs: '/docs/getting-started/your-account' })

interface Cell {
  topic: NotificationTopic
  email: boolean
  push: boolean
}

const toast = useToast()
const loading = ref(true)
const saving = ref('')
const topics = ref<Cell[]>([])

async function load(): Promise<void> {
  loading.value = true
  const answer = await $fetch<{ topics: Cell[] }>('/api/account/notifications')
  topics.value = answer.topics
  loading.value = false
}

// The switch is the confirmation: a saved change raises nothing of its own (H-104 criterion 7).
async function save(cell: Cell, wanted: boolean): Promise<void> {
  saving.value = cell.topic
  try {
    await $fetch('/api/account/notifications', { method: 'PUT', body: { topic: cell.topic, email: wanted, push: cell.push } })
    cell.email = wanted
  }
  catch (error) {
    toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    saving.value = ''
  }
}

onMounted(load)

useSeoMeta({ title: 'Email settings' })
</script>

<template>
  <AccountSettings
    data-test="account-notifications-page"
    title="Email settings"
    description="We email you about the topics switched on here; each still lands in your notifications on My NNT whatever you choose, and tickets, receipts, security emails and safety notices always arrive by email."
  >
    <UPageCard>
      <div
        v-if="loading"
        class="flex items-center gap-3 text-muted"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="animate-spin"
        />
        <span>Reading your settings.</span>
      </div>

      <div
        v-else
        class="space-y-5"
        data-test="preference-matrix"
      >
        <USwitch
          v-for="cell in topics"
          :key="cell.topic"
          :model-value="cell.email"
          :label="TOPIC_LABELS[cell.topic]"
          :description="TOPIC_DESCRIPTIONS[cell.topic]"
          :loading="saving === cell.topic"
          :data-test="`email-${cell.topic}`"
          @update:model-value="value => save(cell, value)"
        />

        <ULink
          to="/my/notifications"
          class="block text-sm"
        >
          See your notifications
        </ULink>
      </div>
    </UPageCard>
  </AccountSettings>
</template>
