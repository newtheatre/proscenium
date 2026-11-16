<script setup lang="ts">
// Adding a run of performances (C-04): first and last date, days of the week and times. Every
// performance the run would make is listed before anything is saved, with those that are past,
// clash or fall in a closure marked and left out. A long run is made by a job; the production's
// performances section follows its progress.
interface Planned { startsAt: number, endsAt: number, doorsAt: number | null, operatingDay: string, problem: 'past' | 'clash' | 'closed' | null, reason: string | null }
interface Space { value: string, label: string, venueId: string }

const props = defineProps<{ productionId: string, spaces: Space[], timeZone: string | undefined }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ added: [answer: { created: number } | { run: { id: string, total: number } }] }>()

const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

const DAYS = [{ value: '1', label: 'Mon' }, { value: '2', label: 'Tue' }, { value: '3', label: 'Wed' }, { value: '4', label: 'Thu' }, { value: '5', label: 'Fri' }, { value: '6', label: 'Sat' }, { value: '7', label: 'Sun' }]
const form = ref({ spaceId: '', from: '', to: '', days: ['2', '3', '4', '5', '6'] as string[], times: '19:30', minutes: null as number | null, scheduled: true })
const planned = ref<Planned[] | null>(null)
const busy = ref(false)
const kept = computed(() => (planned.value ?? []).filter(p => !p.problem))
const marked = computed(() => (planned.value ?? []).filter(p => p.problem).length)
const when = computed(() => new Intl.DateTimeFormat('en-GB', { timeZone: props.timeZone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))

watch(open, (v) => {
  if (!v) return
  refusal.value = null
  planned.value = null
  form.value.spaceId ||= props.spaces[0]?.value ?? ''
})
// Any change to the pattern needs a fresh preview before it can be added.
watch(form, () => { planned.value = null }, { deep: true })

const times = () => form.value.times.split(/[\s,]+/).filter(Boolean)
const space = () => props.spaces.find(s => s.value === form.value.spaceId)

async function preview() {
  const s = space()
  if (!s) return
  refusal.value = null
  busy.value = true
  try {
    const answer = await $api<{ performances: Planned[] }>(`/api/core/productions/${props.productionId}/performances/plan` as string, {
      method: 'POST',
      body: { venueId: s.venueId, spaceId: s.value, from: form.value.from, to: form.value.to, days: form.value.days.map(Number), times: times(), minutes: form.value.minutes },
    })
    planned.value = answer.performances
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}

async function add() {
  const s = space()
  if (!s || !kept.value.length) return
  refusal.value = null
  busy.value = true
  try {
    const answer = await $api<{ created: number } | { run: { id: string, total: number } }>(`/api/core/productions/${props.productionId}/performances/run` as string, {
      method: 'POST',
      body: { venueId: s.venueId, spaceId: s.value, scheduled: form.value.scheduled, performances: kept.value.map(({ startsAt, endsAt, doorsAt }) => ({ startsAt, endsAt, doorsAt })) },
    })
    open.value = false
    emit('added', answer)
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
    title="Add a run"
    description="Every performance the run would make is listed first. Any that are past, clash or fall in a closure are left out."
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <form
        id="performance-run"
        class="space-y-4"
        @submit.prevent="planned ? add() : preview()"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          label="Space"
          required
        >
          <USelect
            v-model="form.spaceId"
            :items="spaces"
            class="w-full"
          />
        </UFormField>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            label="First date"
            required
          >
            <UInput
              v-model="form.from"
              type="date"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Last date"
            required
          >
            <UInput
              v-model="form.to"
              type="date"
              class="w-full"
            />
          </UFormField>
        </div>
        <UFormField
          label="Days"
          required
        >
          <UCheckboxGroup
            v-model="form.days"
            :items="DAYS"
            orientation="horizontal"
          />
        </UFormField>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            label="Start times"
            help="Such as 19:30, or 14:30, 19:30 for a matinee too."
            required
          >
            <UInput
              v-model="form.times"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Minutes each"
            help="Left empty, the running time."
          >
            <UInputNumber
              v-model="form.minutes"
              :min="1"
              class="w-full"
            />
          </UFormField>
        </div>
        <UCheckbox
          v-model="form.scheduled"
          label="Schedule them now"
          description="Turn off to add them as drafts, to schedule one by one."
        />

        <div
          v-if="planned"
          class="space-y-2"
        >
          <p class="text-sm">
            {{ kept.length }} to add<template v-if="marked">
              , {{ marked }} left out
            </template>.
          </p>
          <ul class="max-h-72 divide-y divide-default overflow-y-auto rounded-md border border-default text-sm">
            <li
              v-for="p in planned"
              :key="p.startsAt"
              class="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              :class="p.problem ? 'text-muted' : ''"
            >
              <span :class="p.problem ? 'line-through' : ''">{{ when.format(p.startsAt) }}</span>
              <span
                v-if="p.reason"
                class="text-error"
              >{{ p.reason }}</span>
            </li>
          </ul>
        </div>
      </form>
    </template>
    <template #footer>
      <UButton
        v-if="!planned"
        type="submit"
        form="performance-run"
        label="Show the dates"
        :loading="busy"
        :disabled="!form.spaceId || !form.from || !form.to || !form.days.length || !times().length"
      />
      <template v-else>
        <UButton
          label="Change the pattern"
          color="neutral"
          variant="outline"
          @click="planned = null"
        />
        <UButton
          type="submit"
          form="performance-run"
          :label="`Add ${kept.length} performance${kept.length === 1 ? '' : 's'}`"
          :loading="busy"
          :disabled="!kept.length"
        />
      </template>
    </template>
  </UModal>
</template>
