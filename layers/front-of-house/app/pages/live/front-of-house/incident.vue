<!-- Report an incident (Front of house specification, part 5, "Live mode"; FH-27, IN-1): four short
     steps, what happened (and what kind); when and where; who was involved; what was done straight
     away, first aid, emergency services and whether it is serious. The time is a day (today, or
     yesterday for something just before midnight) and a clock time, both in the theatre's time zone
     whatever the phone's. Who is optional: someone working the performance, found by search when the
     report comes from its board, or anyone else by name (an audience member, say) with a way to
     reach them, each with how they were involved. Welfare details are left to whoever reviews it.
     Then "Sent" with its number. Sending needs a connection for now: while the device is offline
     the steps can be filled in but the send button waits, and says why. -->
<script setup lang="ts">
import { CalendarDateTime, now as nowIn, Time, toZoned } from '@internationalized/date'
import { useOnline } from '@vueuse/core'

interface Board { performance: { id: string, title: string, startsAt: number, venueId: string } }
type Involvement = 'affected' | 'witness' | 'helped' | 'other'
interface Named { key: string, accountId: string | null, name: string, contact: string | null, involvement: Involvement }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const online = useOnline()
const { zone } = useDates()
const route = useRoute()
// Reported from a performance's board, the report is tied to that performance and its venue.
const performanceId = typeof route.query.performance === 'string' ? route.query.performance : null
const board = performanceId
  ? (await useAPI<Board>(`/api/front-of-house/performances/${encodeURIComponent(performanceId)}/tonight`, { key: `front-of-house:board:${performanceId}` })).data
  : ref<Board | null>(null)

const started = nowIn(zone.value)
const at = shallowRef(new Time(started.hour, started.minute))
const day = ref<'today' | 'yesterday'>('today')
const days = computed(() => (['today', 'yesterday'] as const).map(value => ({ value, label: t(`front-of-house.live.incident.${value}`) })))
const form = ref({ whatHappened: '', whereNote: '', kind: 'incident' as 'incident' | 'near_miss', immediateAction: '', firstAidGiven: false, emergencyServicesCalled: false, serious: false })
const step = ref(0)

// Who was involved (IN-1). People are added one at a time: someone working the performance the report
// is about, found by search, or anyone else by name. Without a performance there is no one to search.
const people = ref<Named[]>([])
const involvements = computed(() => (['affected', 'witness', 'helped', 'other'] as const).map(value => ({ value, label: t(`front-of-house.involvements.${value}`) })))
const sources = computed(() => [
  { value: 'system', label: t('front-of-house.live.incident.who-system') },
  { value: 'other', label: t('front-of-house.live.incident.who-other') },
])
const crew = computed(() => board.value ? `/api/front-of-house/incidents/people?performance=${encodeURIComponent(board.value.performance.id)}` : null)
const blank = () => ({ source: (crew.value ? 'system' : 'other') as 'system' | 'other', accountId: undefined as string | undefined, label: '', name: '', contact: '', involvement: 'affected' as Involvement })
const person = ref(blank())
const unnamed = ref(false)
const picked = computed(() => people.value.flatMap(p => p.accountId ? [p.accountId] : []))
function addPerson() {
  const p = person.value
  const name = p.source === 'system' ? p.label : p.name.trim()
  if (p.source === 'system' ? !p.accountId : !name) {
    unnamed.value = true
    return
  }
  people.value.push({
    key: crypto.randomUUID(),
    accountId: p.source === 'system' ? p.accountId! : null,
    name,
    contact: p.source === 'other' ? p.contact.trim() || null : null,
    involvement: p.involvement,
  })
  person.value = { ...blank(), source: p.source }
  unnamed.value = false
}
watch(() => [person.value.source, person.value.accountId, person.value.name], () => { unnamed.value = false })
const sent = ref<{ reference: string } | null>(null)
const sending = ref(false)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
// One key for this report, kept across a retried send, so a report is never made twice.
let reportKey: string | undefined

const steps = computed(() => [
  { title: t('front-of-house.live.incident.step-what'), icon: 'i-lucide-pen-line' },
  { title: t('front-of-house.live.incident.step-when'), icon: 'i-lucide-clock' },
  { title: t('front-of-house.live.incident.step-who'), icon: 'i-lucide-users' },
  { title: t('front-of-house.live.incident.step-help'), icon: 'i-lucide-heart-pulse' },
])
const kinds = computed(() => (['incident', 'near_miss'] as const).map(value => ({ value, label: t(`front-of-house.incident-kinds.${value}`) })))
/** The day and clock time given, in the theatre's time zone. */
function occurredAt(): number {
  const base = nowIn(zone.value)
  const d = day.value === 'yesterday' ? base.subtract({ days: 1 }) : base
  return toZoned(new CalendarDateTime(d.year, d.month, d.day, at.value.hour, at.value.minute), zone.value).toDate().getTime()
}
// Only a time still to come is refused: something at 23:50 reported at 00:10 is yesterday's.
const later = ref(false)
watch([at, day], () => { later.value = false })
const canGo = computed(() => step.value !== 0 || form.value.whatHappened.trim().length > 0)
function next() {
  if (step.value === 1 && occurredAt() > Date.now()) {
    later.value = true
    return
  }
  // Someone filled in but not yet added is added on the way, rather than lost.
  if (step.value === 2 && (person.value.accountId || person.value.name.trim())) addPerson()
  step.value++
}

async function send() {
  refusal.value = null
  sending.value = true
  try {
    const f = form.value
    reportKey ??= crypto.randomUUID()
    const answer = await $api<{ reference: string }>('/api/front-of-house/incidents', {
      method: 'POST',
      headers: { 'idempotency-key': reportKey },
      body: {
        kind: f.kind,
        occurredAt: occurredAt(),
        performanceId: board.value?.performance.id ?? null,
        venueId: board.value?.performance.venueId ?? null,
        whereNote: f.whereNote.trim() || null,
        whatHappened: f.whatHappened.trim(),
        immediateAction: f.immediateAction.trim() || null,
        firstAidGiven: f.firstAidGiven,
        emergencyServicesCalled: f.emergencyServicesCalled,
        serious: f.serious,
        people: people.value.map(p => ({ accountId: p.accountId, name: p.accountId ? null : p.name, contact: p.contact, involvement: p.involvement })),
      },
    })
    sent.value = { reference: answer.reference }
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    sending.value = false
  }
}
const back = computed(() => board.value ? `/live/front-of-house/${encodeURIComponent(board.value.performance.id)}` : '/live/front-of-house')
</script>

<template>
  <PageLive
    :title="t('front-of-house.live.report-incident')"
    :context="board?.performance.title"
    :back="back"
  >
    <div class="mx-auto max-w-2xl space-y-6">
      <template v-if="sent">
        <UAlert
          color="success"
          variant="subtle"
          icon="i-lucide-circle-check"
          :title="t('front-of-house.live.incident.sent', { reference: sent.reference })"
          :description="t('front-of-house.live.incident.sent-description')"
        />
        <UButton
          :to="back"
          size="xl"
          block
          :label="t('front-of-house.live.done')"
        />
      </template>
      <template v-else>
        <UStepper
          v-model="step"
          :items="steps"
          size="sm"
          disabled
        />
        <RefusalNotice :refusal="refusal" />

        <div
          v-if="step === 0"
          class="space-y-4"
        >
          <UFormField :label="t('front-of-house.live.incident.kind')">
            <URadioGroup
              v-model="form.kind"
              :items="kinds"
              size="xl"
              variant="card"
            />
          </UFormField>
          <UFormField
            :label="t('front-of-house.live.incident.what')"
            :help="t('front-of-house.live.incident.what-help')"
            required
          >
            <UTextarea
              v-model="form.whatHappened"
              :maxlength="4000"
              :rows="5"
              autoresize
              size="xl"
            />
          </UFormField>
        </div>

        <div
          v-else-if="step === 1"
          class="space-y-4"
        >
          <UFormField
            :label="t('front-of-house.live.incident.day')"
          >
            <URadioGroup
              v-model="day"
              :items="days"
              orientation="horizontal"
              size="xl"
              variant="card"
            />
          </UFormField>
          <UFormField
            :label="t('front-of-house.live.incident.when')"
            :help="t('front-of-house.live.incident.when-help')"
            :error="later ? t('front-of-house.live.incident.later') : undefined"
          >
            <UInputTime
              v-model="at"
              size="xl"
            />
          </UFormField>
          <UFormField :label="t('front-of-house.live.incident.where')">
            <UInput
              v-model="form.whereNote"
              :maxlength="120"
              size="xl"
            />
          </UFormField>
        </div>

        <div
          v-else-if="step === 2"
          class="space-y-4"
        >
          <p class="text-muted">
            {{ t('front-of-house.live.incident.who-help') }}
          </p>
          <RecordList
            v-if="people.length"
            :label="t('front-of-house.live.incident.who-list')"
          >
            <RecordListItem
              v-for="(p, i) in people"
              :key="p.key"
              icon="i-lucide-user"
              :name="p.name"
              :description="[t(`front-of-house.involvements.${p.involvement}`), p.contact].filter(Boolean).join(' · ')"
            >
              <IconButton
                icon="i-lucide-x"
                size="lg"
                :label="t('front-of-house.live.incident.who-remove', { name: p.name })"
                @click="people.splice(i, 1)"
              />
            </RecordListItem>
          </RecordList>
          <div class="space-y-4 rounded-md border border-default p-4">
            <URadioGroup
              v-if="crew"
              v-model="person.source"
              :items="sources"
              orientation="horizontal"
              size="xl"
              variant="card"
              :aria-label="t('front-of-house.live.incident.who-source')"
            />
            <UFormField
              v-if="crew && person.source === 'system'"
              :label="t('front-of-house.live.incident.who-person')"
              :error="unnamed ? t('front-of-house.live.incident.who-choose') : undefined"
            >
              <PersonPicker
                v-model="person.accountId"
                :endpoint="crew ?? undefined"
                :exclude="picked"
                size="xl"
                @picked="p => person.label = p?.label ?? ''"
              />
            </UFormField>
            <template v-else>
              <UFormField
                :label="t('front-of-house.live.incident.who-name')"
                :error="unnamed ? t('front-of-house.live.incident.who-name-needed') : undefined"
              >
                <UInput
                  v-model="person.name"
                  :maxlength="120"
                  size="xl"
                />
              </UFormField>
              <UFormField
                :label="t('front-of-house.live.incident.who-contact')"
                :help="t('front-of-house.live.incident.who-contact-help')"
              >
                <UInput
                  v-model="person.contact"
                  :maxlength="200"
                  size="xl"
                />
              </UFormField>
            </template>
            <UFormField :label="t('front-of-house.live.incident.who-involvement')">
              <URadioGroup
                v-model="person.involvement"
                :items="involvements"
                size="xl"
                variant="card"
              />
            </UFormField>
            <UButton
              color="neutral"
              variant="outline"
              size="xl"
              block
              icon="i-lucide-user-plus"
              :label="t('front-of-house.live.incident.who-add')"
              @click="addPerson"
            />
          </div>
        </div>

        <div
          v-else
          class="space-y-4"
        >
          <UFormField :label="t('front-of-house.live.incident.done-straight-away')">
            <UTextarea
              v-model="form.immediateAction"
              :maxlength="2000"
              autoresize
              size="xl"
            />
          </UFormField>
          <USwitch
            v-model="form.firstAidGiven"
            size="xl"
            :label="t('front-of-house.live.incident.first-aid')"
          />
          <USwitch
            v-model="form.emergencyServicesCalled"
            size="xl"
            :label="t('front-of-house.live.incident.emergency-services')"
          />
          <USwitch
            v-model="form.serious"
            size="xl"
            :label="t('front-of-house.live.incident.serious')"
            :description="t('front-of-house.live.incident.serious-help')"
          />
          <UAlert
            v-if="!online"
            color="warning"
            variant="subtle"
            icon="i-lucide-wifi-off"
            :title="t('front-of-house.live.incident.offline')"
          />
        </div>
      </template>
    </div>

    <template
      v-if="!sent"
      #footer
    >
      <div class="mx-auto flex max-w-2xl gap-3">
        <UButton
          v-if="step > 0"
          color="neutral"
          variant="outline"
          size="xl"
          icon="i-lucide-arrow-left"
          :label="t('front-of-house.live.incident.back')"
          @click="step--"
        />
        <UButton
          v-if="step < 3"
          size="xl"
          class="flex-1 justify-center"
          trailing-icon="i-lucide-arrow-right"
          :disabled="!canGo"
          :label="t('front-of-house.live.incident.continue')"
          @click="next"
        />
        <UButton
          v-else
          size="xl"
          color="warning"
          class="flex-1 justify-center"
          icon="i-lucide-send"
          :disabled="!online || !form.whatHappened.trim()"
          :loading="sending"
          :label="t('front-of-house.live.incident.send')"
          @click="send"
        />
      </div>
    </template>
  </PageLive>
</template>
