<!-- A refusal as the server wrote it: what happened and what to do next. -->
<script setup lang="ts">
import type { Refusal } from '../utils/identity'

defineProps<{ refusal: Refusal | null }>()
</script>

<template>
  <UAlert
    v-if="refusal"
    role="alert"
    color="error"
    icon="i-lucide-circle-alert"
    :title="refusal.reason"
    :description="refusal.remedy"
  />
</template>
