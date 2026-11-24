<!-- Not part of this practice (PM-S5, T-PM-16): a page outside the scenario's routes stays closed while
     the person practises, and nothing of it was asked for. They can stay, or leave practice. -->
<script setup lang="ts">
defineProps<{
  /** The scenario's name, already translated. */
  label: string
}>()

const { t } = useT()
const { leave } = usePracticeActions()
const fenced = useState<string | null>('core:practice:fenced', () => null)
const busy = ref(false)

async function leaveNow() {
  busy.value = true
  try {
    await leave()
    fenced.value = null
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal
    :open="fenced !== null"
    :title="t('core.practice.fenced.title')"
    :description="t('core.practice.fenced.description', { scenario: label })"
    @update:open="(value: boolean) => { if (!value) fenced = null }"
  >
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="outline"
          size="xl"
          :disabled="busy"
          :label="t('core.practice.fenced.leave')"
          @click="leaveNow"
        />
        <UButton
          size="xl"
          :label="t('core.practice.fenced.stay')"
          @click="fenced = null"
        />
      </div>
    </template>
  </UModal>
</template>
