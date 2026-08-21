/**
 * Publish a show, optionally putting all its performances on sale too.
 */
<script setup lang="ts">
const props = defineProps<{
  showId: string | null
  performanceCount: number
}>()

const emit = defineEmits<{
  close: []
  refresh: []
}>()

const toast = useToast()
const isSubmitting = ref(false)
const markOnSaleToo = ref(false)

watch(() => props.showId, (id) => {
  if (id) markOnSaleToo.value = false
})

async function onConfirm() {
  if (!props.showId) return
  isSubmitting.value = true
  try {
    const result = await $fetch<{ updatedPerformanceCount: number }>(`/api/shows/${props.showId}/publish`, {
      method: 'POST',
      body: { markPerformancesOnSale: markOnSaleToo.value },
    })
    toast.add({
      title: 'Show published',
      description: result.updatedPerformanceCount > 0
        ? `${result.updatedPerformanceCount} performance(s) marked on sale`
        : undefined,
      icon: 'i-lucide-check',
      color: 'success',
    })
    emit('refresh')
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Failed to publish show'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <UModal
    :open="!!showId"
    title="Publish show"
    description="This makes the show visible on the public site."
    @close="emit('close')"
  >
    <template #body>
      <div class="space-y-4">
        <UCheckbox
          v-if="performanceCount > 0"
          v-model="markOnSaleToo"
          label="Also mark all performances as on sale"
        />
        <div class="flex justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="subtle"
            :disabled="isSubmitting"
            @click="emit('close')"
          />
          <UButton
            label="Publish"
            icon="i-lucide-badge-check"
            :loading="isSubmitting"
            @click="onConfirm"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
