<script setup lang="ts">
import { saysWhen } from '#shared/utils/when'

definePageMeta({ layout: 'member', middleware: 'signed-in', docs: '/docs/getting-started/your-account' })

interface InboxItem {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  createdAt: number
}

const request = useRequestFetch()

// Newest first, and holding whatever an email setting could have silenced (H-102 criterion 6, issue 1345).
const { data, status, error, refresh } = await useAsyncData(
  'my-notifications',
  () => request<{ items: InboxItem[] }>('/api/account/inbox'),
  { default: () => ({ items: [] as InboxItem[] }) },
)

const failure = useListFailure(error, 'Your notifications could not be read.')

const SETTINGS = [{ label: 'Email settings', to: '/account/notifications', icon: 'i-lucide-mail', color: 'neutral' as const, variant: 'outline' as const }]

useSeoMeta({ title: 'Notifications' })
</script>

<template>
  <UContainer
    data-test="inbox"
    :class="MEMBER_PAGE_READING"
  >
    <UPageHeader
      title="Notifications"
      description="Notifications we send you here, newest first. Anything an email setting can switch off lands here too, so switching one off never loses it."
      :links="SETTINGS"
      :ui="MEMBER_PAGE_HEADER"
    />

    <div
      v-if="status === 'pending'"
      class="mt-8 flex items-center gap-3 text-muted"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="animate-spin"
      />
      <span>Reading your notifications.</span>
    </div>

    <ReadFailure
      v-else-if="failure"
      :failure="failure"
      class="mt-8"
      @retry="refresh()"
    />

    <p
      v-else-if="data.items.length === 0"
      class="mt-8 text-sm text-muted"
      data-test="inbox-empty"
    >
      Nothing has come in. News about your room bookings, shifts and training lands here, and so do
      committee announcements.
    </p>

    <ul
      v-else
      class="mt-8 divide-y divide-default text-sm"
    >
      <li
        v-for="item in data.items"
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
            {{ saysWhen(item.createdAt) }}
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
  </UContainer>
</template>
