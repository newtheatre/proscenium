<script setup lang="ts">
import { saysPassStatus } from '#shared/utils/passes'
import type { PassRequestStatus, PassStatus } from '#shared/utils/passes'
import type { MySummary } from '#shared/utils/my-summary'

const props = defineProps<{ summary: MySummary }>()

const pass = computed(() => props.summary.passes.active[0] ?? null)
const request = computed(() => props.summary.passes.request)
</script>

<template>
  <MyTile
    title="Passes"
    to="/account/passes"
    label="See passes"
    :empty="!pass && !request"
    empty-title="No pass"
    empty-label="See passes"
  >
    <template v-if="pass">
      <p class="font-semibold">
        {{ pass.typeName }}
      </p>
      <p
        v-if="pass.covers"
        class="text-sm text-muted"
      >
        {{ pass.covers }}
      </p>
      <UBadge
        color="success"
        variant="subtle"
        class="mt-2"
      >
        {{ saysPassStatus(pass.status as PassStatus) }}
      </UBadge>
    </template>
    <p
      v-else-if="request"
      class="text-sm text-muted"
    >
      Your pass request is {{ saysPassStatus(request.state as PassRequestStatus).toLowerCase() }}
    </p>
  </MyTile>
</template>
