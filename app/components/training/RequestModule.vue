<script setup lang="ts">
import { REQUEST_NOTE_LIMIT } from '#shared/utils/training'

// The ask-for-this modal, shared by the catalogue card, the module page and /training (G-129).
// Asking tells the department there is demand; it holds no place and confers no priority.

const props = defineProps<{
  moduleId: string
  moduleName: string
  requested: boolean
}>()

const emit = defineEmits<{ requested: [] }>()

const open = ref(false)
const note = ref('')
const failure = ref<string | null>(null)
const saving = ref(false)
const toast = useToast()

async function submit(): Promise<void> {
  saving.value = true
  failure.value = null
  try {
    await $fetch('/api/training/requests', {
      method: 'POST',
      body: { moduleId: props.moduleId, note: note.value.trim() || undefined },
    })
    toast.add({ title: 'Asked', description: 'A lead will see it on their board.', icon: 'i-lucide-check', color: 'success' })
    open.value = false
    note.value = ''
    emit('requested')
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UBadge
    v-if="requested"
    color="neutral"
    variant="subtle"
    data-test="module-requested"
  >
    Requested
  </UBadge>
  <UButton
    v-else
    size="sm"
    data-test="request-module"
    @click.stop.prevent="open = true"
  >
    Request this module
  </UButton>

  <UModal
    v-model:open="open"
    :title="`Ask for ${moduleName}`"
    description="It tells the department there is demand. It does not hold you a place, and it never expires on its own."
  >
    <template #body>
      <UAlert
        v-if="failure"
        data-test="request-module-failure"
        color="error"
        variant="subtle"
        :description="failure"
        class="mb-4"
      />
      <UFormField
        label="Anything worth saying"
        hint="Optional"
        description="When you are free, why you need it, who else wants it."
      >
        <UTextarea
          v-model="note"
          :rows="3"
          :maxlength="REQUEST_NOTE_LIMIT"
          class="w-full"
          data-test="ask-note"
        />
      </UFormField>

      <div class="mt-4 flex flex-wrap gap-2">
        <UButton
          data-test="ask-submit"
          :loading="saving"
          @click.stop.prevent="submit"
        >
          Ask
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click.stop.prevent="open = false"
        >
          Back
        </UButton>
      </div>
    </template>
  </UModal>
</template>
