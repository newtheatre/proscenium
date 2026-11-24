<!-- The pretend "confirm it's you" (Practice mode, M6, PM-17): the same step as the real dialogue,
     labelled as pretend, accepting a press. It records the press in the practice store only, so the
     real sign-in's freshness is untouched. -->
<script setup lang="ts">
const emit = defineEmits<{ close: [confirmed: boolean] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const busy = ref(false)

async function confirm() {
  busy.value = true
  try {
    await $api('/api/core/practice/reassert', { method: 'POST', body: {} })
    emit('close', true)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal
    :title="t('core.practice.confirm.title')"
    :description="t('core.practice.confirm.description')"
    :close="{ onClick: () => emit('close', false) }"
  >
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          size="xl"
          :label="t('core.form.cancel')"
          @click="emit('close', false)"
        />
        <UButton
          size="xl"
          :loading="busy"
          :label="t('core.practice.confirm.press')"
          @click="confirm"
        />
      </div>
    </template>
  </UModal>
</template>
