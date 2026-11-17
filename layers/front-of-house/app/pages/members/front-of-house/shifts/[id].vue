<!-- One shift, as a member sees it (Front of house specification, part 5, "Members' area"): the
     performance, venue, duty, call and end, the briefing and who else is on. The one action follows
     the person's place: sign up, withdraw, give it up (the notice rule said before confirming), keep
     it, take someone's place who needs cover, or "I'm here" inside the window. -->
<script setup lang="ts">
interface ShiftView {
  id: string
  performanceId: string | null
  title: string | null
  dutyName: string
  dutyDescription: string | null
  productionTitle: string | null
  venueName: string | null
  places: number
  placesTaken: number
  callAt: number
  endsAt: number
  windowOpensAt: number
  windowClosesAt: number
  signUpClosesAt: number | null
  briefing: string | null
  state: 'draft' | 'published' | 'completed' | 'cancelled'
  releaseNotice: number
  people: { name: string, state: string }[]
  mine: { assignmentId: string, state: string } | null
  coverFor: string | null
}

const { t } = useT()
const write = useAct()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const { dateTime, time } = useDates()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<ShiftView>(() => `/api/front-of-house/shifts/${encodeURIComponent(id.value)}`, { key: `front-of-house:shift:${id.value}` })

const TONES: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  requested: 'info', confirmed: 'success', checked_in: 'success', release_requested: 'warning',
}
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const now = ref(Date.now())
onMounted(() => {
  const timer = setInterval(() => now.value = Date.now(), 30_000) // not-policy: how often the window is looked at again
  onBeforeUnmount(() => clearInterval(timer))
})

async function act(path: string, body: Record<string, unknown>, done: string) {
  refusal.value = null
  try {
    await write(path, { method: 'POST', body })
    toast.add({ title: done, color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

const name = computed(() => {
  const s = data.value
  if (!s) return ''
  return s.productionTitle ? t('front-of-house.shift.of-show', { duty: s.dutyName, show: s.productionTitle }) : s.title ? t('front-of-house.shift.of-occasion', { duty: s.dutyName, title: s.title }) : s.dutyName
})
// Within the release notice a place is not simply given up: cover is asked for and the person stays on.
const noticeHours = computed(() => Math.round((data.value?.releaseNotice ?? 0) / 3600)) // not-policy: seconds in an hour
async function giveUp() {
  const s = data.value!
  const early = s.callAt - now.value > s.releaseNotice * 1000 // not-policy: seconds to milliseconds
  if (!await confirm({
    verb: t('front-of-house.shift.give-up.verb'),
    thing: t('front-of-house.shift.give-up.thing', { shift: name.value }),
    consequence: early ? t('front-of-house.shift.give-up.early', { count: noticeHours.value }) : t('front-of-house.shift.give-up.late', { count: noticeHours.value }),
    button: t('front-of-house.shift.give-up.button'),
  })) return
  await act(`/api/front-of-house/assignments/${encodeURIComponent(s.mine!.assignmentId)}/release`, {}, t(early ? 'front-of-house.shift.give-up.done' : 'front-of-house.shift.give-up.asked'))
}

type Action = { label: string, icon: string, run: () => Promise<void> }
const primary = computed<Action | null>(() => {
  const s = data.value
  if (!s || s.state !== 'published') return null
  const mine = s.mine
  const assignment = (action: string) => `/api/front-of-house/assignments/${encodeURIComponent(mine!.assignmentId)}/${action}`
  const inWindow = now.value >= s.windowOpensAt && now.value <= s.windowClosesAt
  if (mine && inWindow && (mine.state === 'confirmed' || mine.state === 'release_requested'))
    return { label: t('front-of-house.shift.check-in'), icon: 'i-lucide-map-pin-check', run: () => act(assignment('check-in'), {}, t('front-of-house.shift.checked-in')) }
  if (mine?.state === 'requested')
    return { label: t('front-of-house.shift.withdraw'), icon: 'i-lucide-undo-2', run: () => act(assignment('release'), {}, t('front-of-house.shift.withdrawn')) }
  if (mine?.state === 'confirmed')
    return { label: t('front-of-house.shift.give-up.button'), icon: 'i-lucide-calendar-x', run: giveUp }
  if (mine?.state === 'release_requested')
    return { label: t('front-of-house.shift.keep'), icon: 'i-lucide-calendar-check', run: () => act(assignment('keep'), {}, t('front-of-house.shift.kept')) }
  if (!mine && s.coverFor)
    return { label: t('front-of-house.shift.take-cover'), icon: 'i-lucide-hand-helping', run: () => act(`/api/front-of-house/assignments/${encodeURIComponent(s.coverFor!)}/cover`, {}, t('front-of-house.shift.taken')) }
  if (!mine && s.placesTaken < s.places && s.signUpClosesAt !== null && s.signUpClosesAt > now.value)
    return { label: t('front-of-house.shift.sign-up'), icon: 'i-lucide-calendar-plus', run: () => act(`/api/front-of-house/shifts/${encodeURIComponent(s.id)}/sign-up`, {}, t('front-of-house.shift.signed-up')) }
  return null
})

const summary = computed(() => {
  const s = data.value
  if (!s) return []
  return [
    { label: t('front-of-house.shift.duty'), value: s.dutyName },
    ...(s.venueName ? [{ label: t('front-of-house.shift.venue'), value: s.venueName }] : []),
    { label: t('front-of-house.shift.call-at'), value: dateTime(s.callAt) },
    { label: t('front-of-house.shift.ends-at'), value: time(s.endsAt) },
    { label: t('front-of-house.shift.places'), value: t('front-of-house.shift.places-value', { taken: s.placesTaken, places: s.places }) },
  ]
})
const statusOf = computed(() => {
  const s = data.value
  if (!s) return undefined
  if (s.state === 'cancelled') return { label: t('front-of-house.shift-states.cancelled'), tone: 'neutral' as const }
  if (s.mine) return { label: t(`front-of-house.assignment-states.${s.mine.state}`), tone: TONES[s.mine.state] ?? 'neutral' }
  return undefined
})
const trail = computed(() => [{ label: t('front-of-house.navigation.shifts.label'), to: '/members/front-of-house' }])
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: s }">
      <PageFrame
        :title="name"
        :trail="trail"
        width="reading"
      >
        <template #status>
          <StatusBadge
            v-if="statusOf"
            :tone="statusOf.tone"
            :label="statusOf.label"
          />
        </template>
        <template #primary>
          <UButton
            v-if="primary"
            :icon="primary.icon"
            :label="primary.label"
            loading-auto
            @click="primary.run"
          />
        </template>
        <div class="space-y-6">
          <RefusalNotice :refusal="refusal" />
          <FactStrip :facts="summary" />
          <PageSection
            v-if="s.dutyDescription || s.briefing"
            :title="t('front-of-house.shift.about')"
          >
            <div class="space-y-3">
              <p v-if="s.dutyDescription">
                {{ s.dutyDescription }}
              </p>
              <p
                v-if="s.briefing"
                class="whitespace-pre-line"
              >
                {{ s.briefing }}
              </p>
            </div>
          </PageSection>
          <PageSection :title="t('front-of-house.shift.who-else')">
            <p
              v-if="!s.people.length"
              class="text-muted"
            >
              {{ t('front-of-house.shift.nobody-yet') }}
            </p>
            <RecordList
              v-else
              :label="t('front-of-house.shift.who-else')"
            >
              <RecordListItem
                v-for="(p, i) in s.people"
                :key="i"
                icon="i-lucide-user"
                :name="p.name"
              />
            </RecordList>
          </PageSection>
        </div>
      </PageFrame>
    </template>
  </DataBoundary>
</template>
