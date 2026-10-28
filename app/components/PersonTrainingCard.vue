<script setup lang="ts">
import { saysDay } from '#shared/utils/when'

// What one person holds now, and what wants renewing, for whoever reads training records (0255).
const props = defineProps<{ userId: string }>()

interface Held { id: string, moduleId: string, moduleName: string, expiresOn: string | null, state: 'VALID' | 'EXPIRING' | 'EXPIRED' | null, says: string, held: boolean }

const request = useRequestFetch()
const { data, error, refresh } = await useAsyncData(
  `person-training-${props.userId}`,
  () => request<{ items: Held[] }>('/api/admin/training/records', { query: { userId: props.userId } }),
  { default: (): { items: Held[] } => ({ items: [] }) },
)
const failure = useListFailure(error, 'Their training could not be read.')

// The whole history stays on Records; here only what counts today, renewals first.
const held = computed(() => data.value.items
  .filter(record => record.held)
  .sort((a, b) => Number(b.state === 'EXPIRING') - Number(a.state === 'EXPIRING') || a.moduleName.localeCompare(b.moduleName)))
</script>

<template>
  <UPageCard
    title="Training"
    description="What they hold today. Their whole history, revoked and superseded records included, is on Records."
    data-test="person-training"
  >
    <ReadFailure
      v-if="failure"
      :failure="failure"
      @retry="refresh"
    />
    <template v-else>
      <p
        v-if="held.length === 0"
        class="text-sm text-muted"
      >
        Nothing held today.
      </p>
      <ul
        v-else
        class="space-y-1 text-sm"
        data-test="person-training-held"
      >
        <li
          v-for="record in held"
          :key="record.id"
          class="flex flex-wrap items-center gap-2"
          :data-test="`person-held-${record.moduleId}`"
        >
          <span>{{ record.moduleName }} <span class="text-muted">({{ record.moduleId }})</span></span>
          <UBadge
            v-if="record.state === 'EXPIRING'"
            color="warning"
            variant="subtle"
            size="sm"
          >
            {{ record.says }}
          </UBadge>
          <span
            v-if="record.expiresOn"
            class="text-xs text-muted"
          >until {{ saysDay(record.expiresOn) }}</span>
        </li>
      </ul>
      <UButton
        class="mt-2"
        :to="`/training/manage/records?person=${userId}`"
        variant="link"
        size="sm"
        icon="i-lucide-clipboard-check"
        label="Open their records"
        data-test="person-training-open"
      />
    </template>
  </UPageCard>
</template>
