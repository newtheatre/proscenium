<!-- Under-18 warnings (F6), for the organiser only: who a time keeps past the latest finish, and a
     find or meeting of exactly one adult and one under-18. Never blocks anything. -->
<script setup lang="ts">
defineProps<{ late: string[], oneToOne?: boolean }>()
const { t } = useT()
</script>

<template>
  <div
    v-if="late.length || oneToOne"
    class="space-y-2"
  >
    <UAlert
      v-if="late.length"
      :title="t('availability.under-18.late', { names: late.join(', ') })"
      icon="i-lucide-triangle-alert"
      color="warning"
      variant="subtle"
    />
    <UAlert
      v-if="oneToOne"
      :title="t('availability.under-18.one-to-one')"
      icon="i-lucide-triangle-alert"
      color="warning"
      variant="subtle"
    />
  </div>
</template>
