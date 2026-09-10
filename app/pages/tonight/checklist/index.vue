<script setup lang="ts">
import { saysPhase } from '#shared/utils/checklist'
import type { Phase, SystemCheck } from '#shared/utils/checklist'

definePageMeta({ layout: 'tonight' })
useSeoMeta({ title: 'Checklist' })

interface Entry {
  id: string
  itemId: string
  phase: Phase
  label: string
  required: boolean
  systemCheck: SystemCheck | null
  done: boolean
  tickedByName: string | null
  tickedAt: number | null
  exempted: boolean
  exemptReason: string | null
  exemptedByName: string | null
  exemptedAt: number | null
}

interface CloseInfo {
  closedAt: number
  closedByName: string
}

const request = useRequestFetch()
const toast = useToast()

const syncedAt = ref<Date | null>(null)
const failure = ref<string | null>(null)
const busy = ref(true)
const items = ref<Entry[]>([])
// Read from the server on every load, never only from `closeNight()`'s own response: otherwise
// a reload forgets the night is closed and re-enables the close action (E-114 follow-up).
const close = ref<CloseInfo | null>(null)
// Carried on every write below: the server resolves tonight's one performance without it, but
// naming it is what the resolved GET already answered with (no picker yet, docs/known-issues.md).
const performanceId = ref<string | null>(null)

async function load(): Promise<void> {
  busy.value = true
  failure.value = null
  try {
    const listed = await request<{ performanceId: string, items: Entry[], close: CloseInfo | null }>('/api/tonight/checklist')
    performanceId.value = listed.performanceId
    items.value = listed.items
    close.value = listed.close
    syncedAt.value = new Date()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    busy.value = false
  }
}

onMounted(load)

const preItems = computed(() => items.value.filter(item => item.phase === 'PRE'))
const postItems = computed(() => items.value.filter(item => item.phase === 'POST'))
const outstandingRequired = computed(() => items.value.filter(item => item.required && !item.done))

const saving = ref(false)

async function tick(entry: Entry): Promise<void> {
  saving.value = true
  try {
    await $fetch(`/api/tonight/checklist/${entry.id}/tick`, { method: 'POST', body: { performanceId: performanceId.value ?? undefined } })
    await load()
  }
  catch (refused) {
    toast.add({ title: 'Could not tick that item', description: refusalText(refused), icon: 'i-lucide-x', color: 'error' })
  }
  finally {
    saving.value = false
  }
}

const exempting = ref<Entry | null>(null)
const exemptReason = ref('')
const exemptFailure = ref<string | null>(null)

function openExempt(entry: Entry): void {
  exempting.value = entry
  exemptReason.value = ''
  exemptFailure.value = null
}

async function submitExempt(): Promise<void> {
  if (!exempting.value) return
  saving.value = true
  exemptFailure.value = null
  try {
    await $fetch(`/api/tonight/checklist/${exempting.value.id}/exempt`, { method: 'POST', body: { performanceId: performanceId.value ?? undefined, reason: exemptReason.value } })
    exempting.value = null
    await load()
  }
  catch (refused) {
    exemptFailure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

const closeFailure = ref<string | null>(null)

// Always resyncs, success or refusal: a race can still 409 even with `close` read live, and the
// server's own state answers that, not a guess.
async function closeNight(): Promise<void> {
  saving.value = true
  closeFailure.value = null
  try {
    await $fetch('/api/tonight/checklist/close', { method: 'POST', body: { performanceId: performanceId.value ?? undefined } })
    toast.add({ title: 'Night closed', icon: 'i-lucide-check', color: 'success' })
  }
  catch (refused) {
    closeFailure.value = refusalText(refused)
  }
  finally {
    await load()
    if (close.value) closeFailure.value = null
    saving.value = false
  }
}
</script>

<template>
  <div>
    <NightScreen
      title="Checklist"
      hint="A system-verified item ticks itself. Everything else is yours to tick, or to close over with a reason."
      :stale="syncedAt"
      :busy="busy"
    >
      <UAlert
        v-if="failure"
        data-test="checklist-failure"
        color="error"
        variant="subtle"
        :description="failure"
      />

      <div
        v-else
        class="space-y-6"
        data-test="checklist-list"
      >
        <UAlert
          v-if="close"
          data-test="checklist-closed"
          color="success"
          variant="subtle"
          :description="`Tonight is closed, by ${close.closedByName}.`"
        />

        <section
          v-for="(phaseItems, phase) in { PRE: preItems, POST: postItems }"
          :key="phase"
        >
          <h2 class="mb-2 text-sm font-semibold text-muted">
            {{ saysPhase(phase as Phase) }}
          </h2>
          <p
            v-if="phaseItems.length === 0"
            class="text-sm text-muted"
          >
            Nothing configured.
          </p>
          <ul class="space-y-2">
            <li
              v-for="entry in phaseItems"
              :key="entry.id"
              class="flex items-start justify-between gap-2 rounded-lg border border-default p-3"
              :data-test="`checklist-item-${entry.id}`"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium">
                  {{ entry.label }}
                  <span
                    v-if="!entry.required"
                    class="text-xs text-muted"
                  >(optional)</span>
                </p>
                <p
                  v-if="entry.systemCheck"
                  class="text-xs text-muted"
                >
                  System-verified: {{ entry.done ? 'clear' : 'not yet clear' }}
                </p>
                <p
                  v-else-if="entry.tickedByName"
                  class="text-xs text-muted"
                >
                  Ticked by {{ entry.tickedByName }}
                </p>
                <p
                  v-else-if="entry.exempted"
                  class="text-xs text-muted"
                >
                  Closed over: {{ entry.exemptReason }}
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <UIcon
                  v-if="entry.done"
                  name="i-lucide-check"
                  class="size-5 text-success"
                />
                <template v-else-if="!entry.systemCheck">
                  <UButton
                    size="xs"
                    :loading="saving"
                    :data-test="`tick-${entry.id}`"
                    @click="tick(entry)"
                  >
                    Tick
                  </UButton>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :data-test="`exempt-${entry.id}`"
                    @click="openExempt(entry)"
                  >
                    Close over
                  </UButton>
                </template>
              </div>
            </li>
          </ul>
        </section>

        <UAlert
          v-if="closeFailure"
          data-test="close-failure"
          color="error"
          variant="subtle"
          :description="closeFailure"
        />
        <p
          v-else-if="outstandingRequired.length > 0"
          class="text-sm text-muted"
        >
          {{ outstandingRequired.length }} required item{{ outstandingRequired.length === 1 ? '' : 's' }} still needs completing or an exception before closing.
        </p>
      </div>

      <template #actions>
        <NightAction
          label="Close the night"
          icon="i-lucide-door-closed"
          color="primary"
          :disabled="!!close"
          :loading="saving"
          data-test="close-night"
          @press="closeNight"
        />
      </template>
    </NightScreen>

    <UModal
      :open="exempting !== null"
      :title="exempting ? `Close over: ${exempting.label}` : ''"
      description="This records who and why. It stays on the record."
      @update:open="exempting = null"
    >
      <template #body>
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

          <UFormField label="Why">
            <UTextarea
              v-model="exemptReason"
              :rows="3"
              class="w-full"
              data-test="exempt-reason"
            />
          </UFormField>

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              :loading="saving"
              data-test="exempt-submit"
            >
              Record it
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="exempting = null"
            >
              Back
            </UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
