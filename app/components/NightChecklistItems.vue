<script setup lang="ts">
import { REVIEWED_AT_SIGN_OFF } from '#shared/utils/night-signoff'
import type { SystemCheck } from '#shared/utils/checklist'

// The checklist's rows as the checklist and the night report both draw them (issue 1315): Tick
// where a hand may tick, and a quiet "Can't do this?" line for an exception (E-114 criterion 5).
interface Entry {
  id: string
  label: string
  required: boolean
  systemCheck: SystemCheck | null
  done: boolean
  tickedByName: string | null
  exempted: boolean
  exemptReason: string | null
}

const props = defineProps<{ items: Entry[], performanceId: string | null }>()
const emit = defineEmits<{ changed: [] }>()
const toast = useToast()

// Sign off and close reviews tonight's incidents itself, so that item waits for it and takes no
// exception (issue 1315).
const answeredAtSignOff = (entry: Entry): boolean => !entry.done && entry.systemCheck === REVIEWED_AT_SIGN_OFF

// Per row, not per list: one flag spun every Tick on the list when one was pressed (issue 1150
// item 4).
const savingId = ref<string | null>(null)

async function tick(entry: Entry): Promise<void> {
  savingId.value = entry.id
  try {
    await $fetch(`/api/tonight/checklist/${entry.id}/tick`, { method: 'POST', body: { performanceId: props.performanceId ?? undefined } })
    emit('changed')
  }
  catch (refused) {
    toast.add({ title: 'Could not tick that item', description: refusalText(refused), icon: 'i-lucide-x', color: 'error' })
  }
  finally {
    savingId.value = null
  }
}

const exempting = ref<Entry | null>(null)
const exemptReason = ref('')
const exemptFailure = ref<string | null>(null)
const exemptSaving = ref(false)

function openExempt(entry: Entry): void {
  exempting.value = entry
  exemptReason.value = ''
  exemptFailure.value = null
}

async function submitExempt(): Promise<void> {
  if (!exempting.value) return
  exemptSaving.value = true
  exemptFailure.value = null
  try {
    await $fetch(`/api/tonight/checklist/${exempting.value.id}/exempt`, { method: 'POST', body: { performanceId: props.performanceId ?? undefined, reason: exemptReason.value } })
    exempting.value = null
    emit('changed')
  }
  catch (refused) {
    exemptFailure.value = refusalText(refused)
  }
  finally {
    exemptSaving.value = false
  }
}
</script>

<template>
  <ul class="space-y-2">
    <li
      v-for="entry in items"
      :key="entry.id"
      class="rounded-lg border border-default p-3"
      :data-test="`checklist-item-${entry.id}`"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm font-medium">
            {{ entry.label }}
            <span
              v-if="!entry.required"
              class="text-xs text-muted"
            >(optional)</span>
          </p>
          <p
            v-if="entry.exempted"
            class="text-xs text-muted"
          >
            Exception: {{ entry.exemptReason }}
          </p>
          <p
            v-else-if="answeredAtSignOff(entry)"
            class="text-xs text-muted"
          >
            Clears at Sign off and close
          </p>
          <p
            v-else-if="entry.systemCheck"
            class="text-xs text-muted"
          >
            Ticks itself: {{ entry.done ? 'clear' : 'not yet clear' }}
          </p>
          <p
            v-else-if="entry.tickedByName"
            class="text-xs text-muted"
          >
            Ticked by {{ entry.tickedByName }}
          </p>
        </div>
        <UIcon
          v-if="entry.done"
          name="i-lucide-check"
          class="size-5 shrink-0 text-success"
        />
        <UButton
          v-else-if="!entry.systemCheck"
          class="min-h-12 min-w-12 shrink-0 justify-center"
          :loading="savingId === entry.id"
          :disabled="savingId !== null && savingId !== entry.id"
          :data-test="`tick-${entry.id}`"
          @click="tick(entry)"
        >
          Tick
        </UButton>
      </div>
      <!-- Any open item takes an exception with a reason, a system one included (E-114 criterion 5,
           issue 1296), except the incidents item Sign off and close answers itself (issue 1315). -->
      <UButton
        v-if="!entry.done && !answeredAtSignOff(entry)"
        color="neutral"
        variant="link"
        size="sm"
        class="min-h-12 px-0"
        :data-test="`exempt-${entry.id}`"
        @click="openExempt(entry)"
      >
        Can't do this?
      </UButton>
    </li>
  </ul>

  <NightSheet
    :open="exempting !== null"
    :title="exempting ? `Exception: ${exempting.label}` : ''"
    primary="Make the exception"
    primary-test-id="exempt-submit"
    :loading="exemptSaving"
    @update:open="exempting = null"
    @primary="submitExempt"
  >
    <form
      class="space-y-4"
      data-test="exempt-form"
      @submit.prevent="submitExempt"
    >
      <UAlert
        v-if="exemptFailure"
        data-test="exempt-failure"
        color="error"
        variant="subtle"
        :description="exemptFailure"
      />

      <UFormField label="Why it cannot be done tonight">
        <UTextarea
          v-model="exemptReason"
          :rows="3"
          class="w-full"
          data-test="exempt-reason"
        />
      </UFormField>
    </form>
  </NightSheet>
</template>
