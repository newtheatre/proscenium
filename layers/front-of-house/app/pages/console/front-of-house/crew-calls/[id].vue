<!-- One crew call (festival-ready changes, part 5, "Crew call"): Details (dates, season, perks
     rules), Questions (the form volunteers answer once, in forms' slot), Crew (who signed up and
     whether they have answered) and Shifts. The primary action follows the lifecycle: open, close,
     archive once it has ended. -->
<script setup lang="ts">
type State = 'draft' | 'open' | 'closed' | 'archived'
interface CrewMember { accountId: string, name: string, shifts: number, minutes: number, answered: boolean }
interface CrewShift { id: string, title: string | null, productionTitle: string | null, dutyName: string, callAt: number, endsAt: number, places: number, placesTaken: number, state: string }
interface Call {
  id: string
  name: string
  seasonId: string | null
  seasonName: string | null
  startsOn: string
  endsOn: string
  tshirtMinShifts: number | null
  mealMinMinutes: number | null
  mealsOnRequest: boolean
  state: State
  shifts: number
  crew: number
  questions: boolean
  crewList: CrewMember[]
  shiftList: CrewShift[]
}

const { t } = useT()
const write = useAct()
const { toRefusal } = useRefusal()
const toast = useToast()
const dates = useDates()
const route = useRoute()
const id = computed(() => String(route.params.id))
const path = computed(() => `/api/front-of-house/crew-calls/${encodeURIComponent(id.value)}`)
const { data, status, error, refresh } = await useAPI<Call>(() => path.value, { key: `front-of-house:crew-call:${id.value}` })
const { data: choices } = await useAPI<{ seasons: { id: string, name: string }[] }>('/api/front-of-house/choices', { key: 'front-of-house:choices' })

const TONE = { draft: 'neutral', open: 'success', closed: 'warning', archived: 'neutral' } as const
const NONE = 'none'
const seasonItems = computed(() => [{ value: NONE, label: t('front-of-house.crew-calls.no-season') }, ...(choices.value?.seasons ?? []).map(s => ({ value: s.id, label: s.name }))])
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

async function move(to: State) {
  refusal.value = null
  try {
    await write(`${path.value}/state`, { method: 'POST', body: { to } })
    toast.add({ title: t(`front-of-house.crew-calls.moved.${to}`), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const primary = computed(() => {
  const d = data.value
  if (!d) return null
  if (d.state === 'draft') return { label: t('front-of-house.crew-calls.open'), icon: 'i-lucide-circle-play', hint: d.questions ? undefined : t('front-of-house.crew-calls.open-without-questions'), run: () => move('open') }
  if (d.state === 'open') return { label: t('front-of-house.crew-calls.close'), icon: 'i-lucide-circle-stop', run: () => move('closed') }
  if (d.state === 'closed') return { label: t('front-of-house.crew-calls.archive'), icon: 'i-lucide-archive', run: () => move('archived') }
  return null
})
const actions = computed(() => data.value?.state === 'closed' ? [[{ label: t('front-of-house.crew-calls.reopen'), icon: 'i-lucide-rotate-ccw', onSelect: () => { void move('open') } }]] : [])
const summary = computed(() => {
  const d = data.value
  if (!d) return []
  return [
    { label: t('front-of-house.crew-calls.days'), value: dates.range(d.startsOn, d.endsOn) },
    { label: t('front-of-house.crew-calls.season'), value: d.seasonName ?? t('front-of-house.crew-calls.no-season') },
    { label: t('front-of-house.crew-calls.tab.shifts'), value: String(d.shifts) },
    { label: t('front-of-house.crew-calls.tab.crew'), value: String(d.crew) },
  ]
})
const trail = computed(() => [{ label: t('front-of-house.navigation.crew-calls.label'), to: '/console/front-of-house/crew-calls' }])
const tabs = computed(() => [
  { id: 'details', label: t('front-of-house.crew-calls.tab.details') },
  { id: 'questions', label: t('front-of-house.crew-calls.tab.questions') },
  { id: 'crew', label: t('front-of-house.crew-calls.tab.crew') },
  { id: 'shifts', label: t('front-of-house.crew-calls.tab.shifts') },
])

// Details: saved together; the perks rules are numbers left empty when the call gives none.
const form = reactive({ name: '', seasonId: NONE, days: { start: '', end: '' }, tshirts: false, tshirtMinShifts: 3, meals: false, mealMinMinutes: 240, mealsOnRequest: true })
watch(data, (d) => {
  if (!d) return
  Object.assign(form, {
    name: d.name, seasonId: d.seasonId ?? NONE, days: { start: d.startsOn, end: d.endsOn },
    tshirts: d.tshirtMinShifts !== null, tshirtMinShifts: d.tshirtMinShifts ?? 3, // not-policy: a starting value the manager edits
    meals: d.mealMinMinutes !== null, mealMinMinutes: d.mealMinMinutes ?? 240, mealsOnRequest: d.mealsOnRequest, // not-policy: a starting value the manager edits
  })
}, { immediate: true })
const saving = ref(false)
async function save() {
  refusal.value = null
  saving.value = true
  try {
    await write(path.value, { method: 'PATCH', body: {
      name: form.name.trim(), seasonId: form.seasonId === NONE ? null : form.seasonId, startsOn: form.days.start, endsOn: form.days.end || form.days.start,
      tshirtMinShifts: form.tshirts ? form.tshirtMinShifts : null, mealMinMinutes: form.meals ? form.mealMinMinutes : null, mealsOnRequest: form.mealsOnRequest,
    } })
    toast.add({ title: t('front-of-house.crew-calls.saved'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    saving.value = false
  }
}
const hours = (minutes: number) => t('front-of-house.crew-calls.hours', { count: Math.round(minutes / 6) / 10 }) // not-policy: minutes to hours, to one place
const shiftName = (s: CrewShift) => s.productionTitle ? t('front-of-house.shift.of-show', { duty: s.dutyName, show: s.productionTitle }) : s.title ? t('front-of-house.shift.of-occasion', { duty: s.dutyName, title: s.title }) : s.dutyName
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: d }">
      <PageRecord
        :title="d.name"
        :status="{ label: t(`front-of-house.crew-call-states.${d.state}`), tone: TONE[d.state] }"
        :actions="actions"
        :summary="summary"
        record-type="front-of-house.crew-call"
        :record-id="d.id"
        :tabs="tabs"
        :trail="trail"
        :primary="primary ?? undefined"
        @primary="primary?.run()"
      >
        <template #tab-details>
          <UForm
            class="max-w-xl space-y-4"
            :state="form"
            :validate="() => needs({ name: form.name, days: form.days.start })"
            novalidate
            :disabled="d.state === 'archived'"
            @submit="save"
          >
            <RefusalNotice :refusal="refusal" />
            <UFormField
              name="name"
              :label="t('front-of-house.crew-calls.name')"
              required
            >
              <UInput
                v-model="form.name"
                maxlength="80"
              />
            </UFormField>
            <UFormField
              name="days"
              :label="t('front-of-house.crew-calls.days')"
              required
            >
              <FieldDateRange v-model="form.days" />
            </UFormField>
            <UFormField
              :label="t('front-of-house.crew-calls.season')"
              :help="t('front-of-house.crew-calls.season-help')"
            >
              <USelectMenu
                v-model="form.seasonId"
                :items="seasonItems"
                value-key="value"
              />
            </UFormField>
            <UCheckbox
              v-model="form.tshirts"
              :label="t('front-of-house.crew-calls.tshirts')"
            />
            <UFormField
              v-if="form.tshirts"
              :label="t('front-of-house.crew-calls.tshirt-min-shifts')"
              :help="t('front-of-house.crew-calls.tshirt-min-shifts-help')"
            >
              <FieldNumber
                v-model="form.tshirtMinShifts"
                :min="1"
                :max="50"
              />
            </UFormField>
            <UCheckbox
              v-model="form.meals"
              :label="t('front-of-house.crew-calls.meals')"
            />
            <template v-if="form.meals">
              <UFormField
                :label="t('front-of-house.crew-calls.meal-min-minutes')"
                :help="t('front-of-house.crew-calls.meal-min-minutes-help')"
              >
                <FieldNumber
                  v-model="form.mealMinMinutes"
                  :min="30"
                  :max="720"
                  :step="15"
                />
              </UFormField>
              <UCheckbox
                v-model="form.mealsOnRequest"
                :label="t('front-of-house.crew-calls.meals-on-request')"
                :description="t('front-of-house.crew-calls.meals-on-request-help')"
              />
            </template>
            <UButton
              v-if="d.state !== 'archived'"
              type="submit"
              :loading="saving"
              :label="t('front-of-house.save')"
            />
          </UForm>
        </template>
        <template #tab-questions>
          <div class="space-y-4">
            <p class="text-sm text-muted">
              {{ t('front-of-house.crew-calls.questions-help') }}
            </p>
            <FormsSlotForms
              slot-id="front-of-house.crew-call"
              :subject="d.id"
            />
          </div>
        </template>
        <template #tab-crew>
          <EmptyState
            v-if="!d.crewList.length"
            :title="t('front-of-house.crew-calls.no-crew.title')"
            :description="t('front-of-house.crew-calls.no-crew.description')"
            icon="i-lucide-users-round"
          />
          <RecordList
            v-else
            :label="t('front-of-house.crew-calls.tab.crew')"
          >
            <RecordListItem
              v-for="p in d.crewList"
              :key="p.accountId"
              icon="i-lucide-user"
              :name="p.name"
              :description="[t('front-of-house.crew-calls.shifts-count', { count: p.shifts }), hours(p.minutes)].join(' · ')"
            >
              <StatusBadge
                v-if="d.questions"
                :tone="p.answered ? 'success' : 'warning'"
                :label="t(p.answered ? 'front-of-house.crew-calls.has-answered' : 'front-of-house.crew-calls.not-answered')"
              />
            </RecordListItem>
          </RecordList>
        </template>
        <template #tab-shifts>
          <EmptyState
            v-if="!d.shiftList.length"
            :title="t('front-of-house.crew-calls.no-shifts.title')"
            :description="t('front-of-house.crew-calls.no-shifts.description')"
            icon="i-lucide-calendar-clock"
          />
          <RecordList
            v-else
            :label="t('front-of-house.crew-calls.tab.shifts')"
          >
            <RecordListItem
              v-for="s in d.shiftList"
              :key="s.id"
              :to="`/members/front-of-house/shifts/${encodeURIComponent(s.id)}`"
              :name="shiftName(s)"
              :description="[dates.range(s.callAt, s.endsAt, 'dateTime'), t('front-of-house.shift.places-value', { taken: s.placesTaken, places: s.places })].join(' · ')"
              :muted="s.state === 'cancelled'"
            />
          </RecordList>
        </template>
      </PageRecord>
    </template>
  </DataBoundary>
</template>
