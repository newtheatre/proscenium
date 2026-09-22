<script setup lang="ts">
import { saysPhase } from '#shared/utils/checklist'
import type { Phase, SystemCheck } from '#shared/utils/checklist'

definePageMeta({ layout: 'tonight', docs: '/docs/tonight/checklist' })
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

const route = useRoute()
const request = useRequestFetch()
const toast = useToast()

const syncedAt = ref<Date | null>(null)
const failure = ref<string | null>(null)
const busy = ref(true)
const items = ref<Entry[]>([])
// Read from the server on every load, never only from `closeNight()`'s own response: otherwise
// a reload forgets the night is closed and re-enables the close action (E-114 follow-up).
const close = ref<CloseInfo | null>(null)
// Carried on every write below. The hub and the glance hand the house over in the query, and on a
// matinee day opened cold the switcher below is what names it (E-127 criterion 2).
const performanceId = ref<string | null>(typeof route.query.performanceId === 'string' ? route.query.performanceId : null)

// The one list of tonight's houses every show-night screen reads, so none derives "which" a
// second way (E-127 criterion 2, issue 901).
const authority = useNightAuthority()
const choices = computed(() => authority.value.performances.map(one => ({
  performanceId: one.id,
  showTitle: one.showTitle,
  startsAt: one.startsAt,
})))
const ambiguous = ref(false)

async function load(): Promise<void> {
  busy.value = true
  failure.value = null
  try {
    const listed = await request<{ performanceId: string, items: Entry[], close: CloseInfo | null }>(
      '/api/tonight/checklist',
      { query: performanceId.value ? { performanceId: performanceId.value } : {} },
    )
    performanceId.value = listed.performanceId
    items.value = listed.items
    close.value = listed.close
    ambiguous.value = false
    syncedAt.value = new Date()
  }
  catch (refused) {
    // More than one house is running and nothing named one: the switcher is the answer, not a
    // refusal with nothing to tap (issue 1150 item 4).
    if (!performanceId.value && refusalStatus(refused) === 400) ambiguous.value = true
    else failure.value = refusalText(refused)
  }
  finally {
    busy.value = false
  }
}

function choose(chosen: string): void {
  performanceId.value = chosen
  load()
}

onMounted(load)

const preItems = computed(() => items.value.filter(item => item.phase === 'PRE'))
const postItems = computed(() => items.value.filter(item => item.phase === 'POST'))
const outstandingRequired = computed(() => items.value.filter(item => item.required && !item.done))

const saving = ref(false)
// Per row, not per screen: one flag spun every Tick on the list when one was pressed (issue 1150
// item 4).
const savingId = ref<string | null>(null)

async function tick(entry: Entry): Promise<void> {
  saving.value = true
  savingId.value = entry.id
  try {
    await $fetch(`/api/tonight/checklist/${entry.id}/tick`, { method: 'POST', body: { performanceId: performanceId.value ?? undefined } })
    await load()
  }
  catch (refused) {
    toast.add({ title: 'Could not tick that item', description: refusalText(refused), icon: 'i-lucide-x', color: 'error' })
  }
  finally {
    saving.value = false
    savingId.value = null
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
      hint="An item that ticks itself needs nothing from you. Tick the rest, or make an exception with a reason."
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

      <!-- A matinee day opened cold: name the house rather than refuse into a dead end. -->
      <div
        v-else-if="ambiguous"
        class="space-y-3"
        data-test="checklist-performance-switcher"
      >
        <p class="text-sm text-muted">
          More than one performance is running tonight. Choose the one you are closing.
        </p>
        <NightPerformanceSwitcher
          :performances="choices"
          :selected-id="performanceId"
          @choose="choose"
        />
      </div>

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
            Nothing on this list yet. Ask the Safety Officer to add the items.
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
                  Ticks itself: {{ entry.done ? 'clear' : 'not yet clear' }}
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
                  Exception: {{ entry.exemptReason }}
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
                    class="min-h-12 min-w-12 justify-center"
                    :loading="savingId === entry.id"
                    :disabled="saving && savingId !== entry.id"
                    :data-test="`tick-${entry.id}`"
                    @click="tick(entry)"
                  >
                    Tick
                  </UButton>
                  <UButton
                    color="neutral"
                    variant="ghost"
                    class="min-h-12 min-w-12 justify-center"
                    :data-test="`exempt-${entry.id}`"
                    @click="openExempt(entry)"
                  >
                    Make an exception
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
          {{ plural(outstandingRequired.length, 'required item') }} still open. Tick or make an exception.
        </p>
      </div>

      <!-- Disabled rather than refused on press, with the server's own 409 still behind it: the
           screen already knows what is open, so the press need not go and ask (E-114 criterion 4). -->
      <template #actions>
        <NightAction
          label="Close the night"
          icon="i-lucide-door-closed"
          color="primary"
          :disabled="!!close || ambiguous || outstandingRequired.length > 0"
          :loading="saving"
          data-test="close-night"
          @press="closeNight"
        />
      </template>
    </NightScreen>

    <UModal
      :open="exempting !== null"
      :title="exempting ? `Exception: ${exempting.label}` : ''"
      description="This names who and why, and it stays on the list."
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
              Make the exception
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="exempting = null"
            >
              {{ CONFIRM_BACK_LABEL }}
            </UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
