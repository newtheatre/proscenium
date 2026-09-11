<script setup lang="ts">
import { formatLondon } from '#shared/utils/london'
import { TOPIC_DESCRIPTIONS, TOPIC_LABELS } from '#shared/utils/notifications'
import type { NotificationTopic } from '#shared/utils/senders'

definePageMeta({ layout: 'member', middleware: 'signed-in' })

interface Cell {
  topic: NotificationTopic
  email: boolean
  push: boolean
  stored: boolean
  emailDefault: boolean
  pushDefault: boolean
}

interface InboxItem {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  createdAt: number
}

const toast = useToast()
const loading = ref(true)
const saving = ref('')
const topics = ref<Cell[]>([])
const inbox = ref<InboxItem[]>([])

async function load(): Promise<void> {
  loading.value = true
  const answer = await $fetch<{ topics: Cell[], inbox: InboxItem[] }>('/api/account/notifications')
  topics.value = answer.topics
  inbox.value = answer.inbox
  loading.value = false
}

async function save(cell: Cell, channel: 'email' | 'push', wanted: boolean): Promise<void> {
  saving.value = `${cell.topic}-${channel}`
  const body = { topic: cell.topic, email: cell.email, push: cell.push, [channel]: wanted }
  try {
    await $fetch('/api/account/notifications', { method: 'PUT', body })
    cell[channel] = wanted
    cell.stored = true
    toast.add({ title: 'Saved', description: 'It takes effect on the next message.', icon: 'i-lucide-check', color: 'success' })
  }
  catch (error) {
    toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    saving.value = ''
  }
}

function saysDefault(on: boolean): string {
  return on ? 'On by default' : 'Off by default'
}

onMounted(load)

useSeoMeta({ title: 'Notifications' })
</script>

<template>
  <AccountSettings
    data-test="account-notifications-page"
    title="Notifications"
    description="Choose what we tell you about, by topic rather than by which part of the theatre sends it. Tickets, receipts, security emails and safety notices always arrive: those answer something you just did, and no preference here silences one."
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
        <span>Reading your preferences.</span>
      </div>

      <div
        v-else
        class="space-y-6"
        data-test="preference-matrix"
      >
        <div
          v-for="cell in topics"
          :key="cell.topic"
          class="space-y-2 border-b border-default pb-5 last:border-0 last:pb-0"
          :data-test="`topic-${cell.topic}`"
        >
          <div class="flex flex-wrap items-baseline gap-x-3">
            <h3 class="font-medium">
              {{ TOPIC_LABELS[cell.topic] }}
            </h3>
            <UBadge
              v-if="!cell.stored"
              variant="subtle"
              color="neutral"
              size="sm"
              :data-test="`default-${cell.topic}`"
            >
              Using the default
            </UBadge>
          </div>
          <p class="text-sm text-muted">
            {{ TOPIC_DESCRIPTIONS[cell.topic] }}
          </p>

          <div class="flex flex-wrap items-center gap-x-8 gap-y-2 pt-1">
            <USwitch
              :model-value="cell.email"
              label="Email"
              :description="saysDefault(cell.emailDefault)"
              :loading="saving === `${cell.topic}-email`"
              :data-test="`email-${cell.topic}`"
              @update:model-value="value => save(cell, 'email', value)"
            />
            <USwitch
              :model-value="cell.push"
              label="Push"
              :description="saysDefault(cell.pushDefault)"
              :loading="saving === `${cell.topic}-push`"
              :data-test="`push-${cell.topic}`"
              @update:model-value="value => save(cell, 'push', value)"
            />
            <div class="text-sm text-muted">
              <span class="font-medium text-default">In-app</span>
              <span :data-test="`inbox-${cell.topic}`"> always on</span>
            </div>
          </div>
        </div>

        <p class="text-sm text-muted">
          Push notifications are recorded here but nothing delivers them yet. Switching one on now
          means you are subscribed the day they start working, and we will ask again on the device
          itself before anything is sent.
        </p>
      </div>
    </UPageCard>

    <UPageCard
      class="mt-6"
      title="Recent messages"
      description="Everything the theatre sent you that a preference could have silenced lands here as well, so switching email off never loses a message."
      data-test="inbox"
    >
      <p
        v-if="inbox.length === 0"
        class="text-sm text-muted"
        data-test="inbox-empty"
      >
        Nothing yet.
      </p>

      <ul
        v-else
        class="divide-y divide-default text-sm"
      >
        <li
          v-for="item in inbox"
          :key="item.id"
          class="py-3"
          data-test="inbox-item"
        >
          <div class="flex flex-wrap items-baseline gap-x-3">
            <ULink
              v-if="item.link"
              :to="item.link"
              class="font-medium"
            >
              {{ item.title }}
            </ULink>
            <span
              v-else
              class="font-medium"
            >{{ item.title }}</span>
            <span class="ms-auto text-xs text-muted">
              {{ formatLondon(new Date(item.createdAt * 1000), { dateStyle: 'medium', timeStyle: 'short' }) }}
            </span>
          </div>
          <p
            v-if="item.body"
            class="mt-1 whitespace-pre-line text-muted"
          >
            {{ item.body }}
          </p>
        </li>
      </ul>
    </UPageCard>
  </AccountSettings>
</template>
