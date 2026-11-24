<!-- Asked once a visit, on the first stroke over a day a weekly pattern covers: just these days, or the
     pattern itself (W1). -->
<script setup lang="ts">
import type { Target } from '../composables/useMyAvailability'

defineProps<{ pattern: string | null }>()
const emit = defineEmits<{ choose: [to: Target], dismiss: [] }>()
const { t } = useT()
</script>

<template>
  <UModal
    :open="pattern !== null"
    :title="t('availability.mine.which-title')"
    :description="t('availability.mine.which-help', { pattern: pattern ?? '' })"
    @update:open="v => { if (!v) emit('dismiss') }"
  >
    <template #footer>
      <div class="flex flex-wrap justify-end gap-2">
        <UButton
          :label="t('availability.mine.which-pattern', { pattern: pattern ?? '' })"
          color="neutral"
          variant="outline"
          @click="emit('choose', 'pattern')"
        />
        <UButton
          :label="t('availability.mine.which-days')"
          @click="emit('choose', 'days')"
        />
      </div>
    </template>
  </UModal>
</template>
