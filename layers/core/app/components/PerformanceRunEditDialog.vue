<script setup lang="ts">
import type { HeldRefusal } from './ChangeHeld.vue'

// Editing a whole run: its space, dates and start times, starting from the pattern it was made
// from. Nothing changes until the person has seen what the new pattern adds, moves and removes
// (drafts deleted, scheduled performances cancelled), with what those changes touch and any module
// that refuses one. The running time and doors stay as the run had them. Applying it offers Undo.
import { rowSlots, slotRows, slotsInWords, type RunSlot, type SlotRow } from '../utils/show-defaults'

type Problem = 'past' | 'exists' | 'clash' | 'closed'
interface StoredPattern { from: string, to: string, slots: RunSlot[], minutes?: number | null, doorsBeforeMinutes?: number | null }
interface EditableRun { id: string, venueId: string, spaceId: string, scheduled: boolean, pattern: StoredPattern, count: number, performanceIds: string[] }
interface Space { value: string, label: string, venueId: string }
interface Change {
  add: { startsAt: number, problem: Problem | null, reason: string | null }[]
  move: { performanceId: string, state: 'draft' | 'scheduled', startsAt: number, toStartsAt: number, problem: Problem | null, reason: string | null }[]
  remove: { performanceId: string, state: 'draft' | 'scheduled', startsAt: number }[]
  keep: number
  lines: string[]
  refusal: HeldRefusal | null
}

const props = defineProps<{ productionId: string, run: EditableRun | null, spaces: Space[] }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ changed: [] }>()

const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { offer } = useUndo()
const dates = useDates()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref(false)
const form = ref({ spaceId: '', dates: { start: '', end: '' }, rows: [] as SlotRow[] })
const change = ref<Change | null>(null)
const slots = computed(() => rowSlots(form.value.rows))

watch(open, (v) => {
  if (!v || !props.run) return
  refusal.value = null
  change.value = null
  form.value = { spaceId: props.run.spaceId, dates: { start: props.run.pattern.from, end: props.run.pattern.to }, rows: slotRows(props.run.pattern.slots) }
}, { immediate: true })
// Any change to the pattern needs a fresh preview before it can be applied.
watch(form, () => { change.value = null }, { deep: true })

function body() {
  const run = props.run!
  const space = props.spaces.find(s => s.value === form.value.spaceId)
  return {
    venueId: space?.venueId ?? run.venueId,
    spaceId: form.value.spaceId,
    pattern: { from: form.value.dates.start, to: form.value.dates.end || form.value.dates.start, slots: slots.value, minutes: run.pattern.minutes ?? null, doorsBeforeMinutes: run.pattern.doorsBeforeMinutes ?? null },
  }
}
const adds = computed(() => (change.value?.add ?? []).filter(p => !p.problem))
const moves = computed(() => (change.value?.move ?? []).filter(m => !m.problem))
// What cannot be done, as one list: a new date that clashes, or a move that would.
const blocked = computed(() => [
  ...(change.value?.add ?? []).filter(p => p.problem).map(p => ({ key: `add-${p.startsAt}`, at: p.startsAt, description: p.reason ?? undefined })),
  ...(change.value?.move ?? []).filter(m => m.problem).map(m => ({ key: m.performanceId, at: m.toStartsAt, description: `Stays at ${dates.dateTime(m.startsAt)}: ${m.reason}` })),
])
// Held by something no answer here can settle.
const stuck = computed(() => !!change.value?.refusal && !change.value.refusal.question)
const answer = ref<string | undefined>(undefined)
const nothing = computed(() => !!change.value && !adds.value.length && !moves.value.length && !change.value.remove.length)
const counted = (n: number) => n === 1 ? '1 performance' : `${n} performances`

async function preview() {
  if (!props.run) return
  refusal.value = null
  busy.value = true
  try {
    change.value = await $api<Change>(`/api/core/productions/${props.productionId}/runs/${props.run.id}/plan` as string, { method: 'POST', body: body() })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}

async function apply() {
  const run = props.run
  if (!run || !change.value || nothing.value) return
  refusal.value = null
  // A module's question, such as what happens to the bookings, is answered before the run changes.
  if (change.value.refusal?.question && !answer.value) {
    refusal.value = { code: 'core.form.invalid', reason: `Choose an answer to "${change.value.refusal.question.label}" first.` } as ReturnType<typeof toRefusal>
    return
  }
  busy.value = true
  try {
    if (change.value.refusal) {
      const still = await settleChange(change.value.refusal, answer.value, async () => (await $api<Change>(`/api/core/productions/${props.productionId}/runs/${run.id}/plan` as string, { method: 'POST', body: body() })).refusal)
      change.value.refusal = still
      if (still) return
    }
    const answer = await $api<object>(`/api/core/productions/${props.productionId}/runs/${run.id}/edit` as string, {
      method: 'POST',
      body: { ...body(), seen: { add: adds.value.length, move: moves.value.length, remove: change.value.remove.length } },
    })
    open.value = false
    emit('changed')
    offer('Run changed', async () => {
      await $api<unknown>(`/api/core/productions/${props.productionId}/runs/${run.id}/undo-edit` as string, { method: 'POST', body: answer })
      emit('changed')
    })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Edit the run"
    :description="run ? `${counted(run.count)} to come, made from ${slotsInWords(run.pattern.slots)}. You will see what changes before anything does.` : undefined"
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <UForm
        id="performance-run-edit"
        :state="form"
        :validate="() => needs({ spaceId: form.spaceId, dates: form.dates.start, slots: slots.length > 0 })"
        class="space-y-4"
        novalidate
        @submit="change ? apply() : preview()"
      >
        <RefusalNotice :refusal="refusal" />
        <template v-if="!change">
          <UFormField
            label="Space"
            name="spaceId"
            required
          >
            <USelectMenu
              v-model="form.spaceId"
              value-key="value"
              :items="spaces"
            />
          </UFormField>
          <UFormField
            label="First and last date"
            name="dates"
            required
          >
            <FieldDateRange v-model="form.dates" />
          </UFormField>
          <UFormField
            label="Performances"
            help="One line for each start time, with the days it runs on. The running time and doors stay as they are."
            name="slots"
            required
          >
            <RunSlotsField v-model="form.rows" />
          </UFormField>
        </template>

        <div
          v-else
          class="space-y-4 text-sm"
        >
          <ChangeHeld
            v-model:answer="answer"
            :refusal="change.refusal"
          />
          <p v-if="nothing">
            The new pattern changes nothing.
          </p>
          <p v-else>
            {{ adds.length }} to add, {{ moves.length }} to move, {{ change.remove.length }} to remove<template v-if="change.keep">
              and {{ change.keep }} left as they are
            </template>.
          </p>
          <ul
            v-if="change.lines.length"
            class="list-disc space-y-1 ps-5"
          >
            <li
              v-for="line in change.lines"
              :key="line"
            >
              {{ line }}
            </li>
          </ul>
          <div class="max-h-96 space-y-4 overflow-y-auto">
            <RecordList
              v-if="adds.length"
              label="Added"
            >
              <RecordListItem
                v-for="p in adds"
                :key="p.startsAt"
                icon="i-lucide-plus"
                :name="dates.dateTime(p.startsAt)"
                description="Added"
              />
            </RecordList>
            <RecordList
              v-if="moves.length"
              label="Moved"
            >
              <RecordListItem
                v-for="m in moves"
                :key="m.performanceId"
                icon="i-lucide-arrow-right"
                :name="dates.dateTime(m.toStartsAt)"
                :description="`Moved from ${dates.dateTime(m.startsAt)}`"
              />
            </RecordList>
            <RecordList
              v-if="change.remove.length"
              label="Removed"
            >
              <RecordListItem
                v-for="x in change.remove"
                :key="x.performanceId"
                icon="i-lucide-x"
                :name="dates.dateTime(x.startsAt)"
                :description="x.state === 'scheduled' ? 'Cancelled' : 'Draft deleted'"
              />
            </RecordList>
            <RecordList
              v-if="blocked.length"
              label="Left out"
            >
              <RecordListItem
                v-for="b in blocked"
                :key="b.key"
                icon="i-lucide-ban"
                :name="dates.dateTime(b.at)"
                :description="b.description"
                muted
              />
            </RecordList>
          </div>
        </div>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          v-if="!change"
          type="submit"
          form="performance-run-edit"
          label="Show the changes"
          :loading="busy"
        />
        <template v-else>
          <UButton
            label="Change the pattern"
            :color="nothing || stuck ? undefined : 'neutral'"
            :variant="nothing || stuck ? 'solid' : 'outline'"
            @click="change = null"
          />
          <UButton
            v-if="!nothing && !stuck"
            type="submit"
            form="performance-run-edit"
            label="Apply the changes"
            :loading="busy"
          />
        </template>
      </div>
    </template>
  </UModal>
</template>
