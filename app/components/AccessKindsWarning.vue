<script setup lang="ts">
import { saysAccessKindsMissing } from '#shared/utils/ticket-types'

// Said on both screens that could notice: verifying a profile entitles nobody to anything until
// an access ticket type exists, and nothing else would tell the Secretary or the admin.
interface AccessKinds { access: boolean, companion: boolean }

const request = useRequestFetch()
const { data } = await useAsyncData<AccessKinds>('access-kinds-on-offer', () =>
  request<AccessKinds, string>('/api/admin/ticket-types/access-kinds'), { getCachedData: () => undefined })

const says = computed(() => data.value ? saysAccessKindsMissing(data.value) : null)
</script>

<template>
  <UAlert
    v-if="says"
    color="warning"
    variant="subtle"
    icon="i-lucide-accessibility"
    :description="says"
    data-test="access-kinds-missing"
  />
</template>
