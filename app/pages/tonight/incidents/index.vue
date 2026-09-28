<script setup lang="ts">
import type { NightRole } from '#shared/utils/night-authority'
import { CATEGORIES, DEFAULT_LOG_KIND, LOG_KINDS, logRoute, saysCategory, saysSeverity } from '#shared/utils/incidents'
import { saysClock } from '#shared/utils/when'
import { saysShiftRole } from '#shared/utils/rota'
import { contactRoster, saysPerformanceChoice, saysTeamHolder, telHref } from '#shared/utils/tonight'
import type { Category, Severity } from '#shared/utils/incidents'

definePageMeta({ layout: 'tonight', docs: '/docs/tonight/contacts-and-incidents' })
useSeoMeta({ title: 'Contacts and incidents' })

interface Entry {
  id: string
  performanceId: string
  reportedByName: string
  category: Category
  severity: Severity
  body: string
  happenedAt: number
  supersedesId: string | null
  supersededBy: string | null
  reviewed: boolean
}

const request = useRequestFetch()
const toast = useToast()

const { items, failure, syncedAt, busy, read: readLog, apply: applyLog, load } = useNightLog<Entry>('/api/tonight/incidents')
// What tonight's log is scoped to, resolved once on load: none of BAR, DOOR or DUTY_MANAGER is
// asked to name a performance, so the first role that resolves says which ones are running.
const performanceIds = ref<string[]>([])
// Named where the authority route says what is running, an id where it does not yet: a role can
// resolve a performance the route did not label.
const performances = ref<{ id: string, showTitle: string, startsAt: number }[]>([])
const authorityFailure = ref<string | null>(null)
// A 403 alone is a refusal: a dropped connection or a lapsed session keeps the screen (issue 1304).
const refusal = ref<string | null>(null)
// The review route takes a duty manager and nobody else (E-114 criterion 3), so the action follows
// the layout's own check of that role, asked of the server and never a standing grant (0044).
const nightAuthority = useNightAuthority()
const offersReview = computed(() => nightAuthority.value.roles.includes('DUTY_MANAGER'))

function applyAuthority(answered: SettledRead<NightAuthorityAnswer>): void {
  refusal.value = refusalOf(answered)
  if (answered.kind === 'FAILED') {
    authorityFailure.value = answered.failure
    return
  }
  performanceIds.value = answered.value.performanceIds
  performances.value = answered.value.performances
  authorityFailure.value = null
}

interface TeamSlot { shiftId: string, role: NightRole, filled: boolean, claimed: boolean, name: string | null, phone: string | null }

const team = ref<TeamSlot[]>([])

// Best effort: a roster that will not load is a contacts block that says so, never a screen that
// refuses to show the log behind it.
async function readTeam(): Promise<TeamSlot[]> {
  const read = await settleRead(() => request<{ performances: { team: TeamSlot[] }[] }>('/api/tonight/team'))
  return read.kind === 'READ' ? contactRoster(read.value.performances.flatMap(performance => performance.team)) : []
}

// In the served page, so the team, the log or the refusal is what a phone paints first; none of the
// three waits on another's. Asked with no role, the server refuses about the caller's own position.
const waiting = useServedRead('tonight-incidents', async () => {
  const [authority, log, roster] = await Promise.all([askNightAuthority('ANY'), readLog(), readTeam()])
  return { authority, log, roster }
}, (served) => {
  applyAuthority(served.authority)
  applyLog(served.log)
  team.value = served.roster
})
const settling = computed(() => busy.value || waiting.value)

const performanceOptions = computed(() => performanceIds.value.map((id) => {
  const named = performances.value.find(one => one.id === id)
  return { label: named ? saysPerformanceChoice(named) : id, value: id }
}))

const kindOptions = LOG_KINDS.map(value => ({ label: saysSeverity(value), value }))
const categoryOptions = CATEGORIES.map(value => ({ label: saysCategory(value), value }))

// One sheet for anything worth writing down (issue 1317): the kind is chosen already, a near miss,
// so the routine report is open, a category and a sentence (E-117 criterion 1 as trimmed).
interface LogState {
  performanceId: string | null
  kind: Severity | null
  category: Category | null
  body: string
}

const blankLog = (): LogState => ({
  performanceId: performanceIds.value[0] ?? null,
  kind: DEFAULT_LOG_KIND,
  category: null,
  body: '',
})

const logging = ref(false)
const logForm = reactive<LogState>(blankLog())
const logFailure = ref<string | null>(null)
const saving = ref(false)
const logReady = computed(() => Boolean(logForm.performanceId && logForm.kind && logForm.category && logForm.body.trim()))

function openLog(): void {
  Object.assign(logForm, blankLog())
  logFailure.value = null
  logging.value = true
}

// A near miss keeps its own route, filed as it happens with no severity; anything else is the
// log's, timed now (E-115 criterion 1, E-117 criterion 2).
async function submitLog(): Promise<void> {
  if (!logReady.value || !logForm.kind) return
  saving.value = true
  logFailure.value = null
  const nearMiss = logForm.kind === 'NEAR_MISS'
  const body = nearMiss
    ? { performanceId: logForm.performanceId, category: logForm.category, body: logForm.body }
    : { performanceId: logForm.performanceId, category: logForm.category, severity: logForm.kind, body: logForm.body, happenedAt: null }
  try {
    await $fetch(logRoute(logForm.kind), { method: 'POST', body })
    toast.add({ title: nearMiss ? 'Near miss logged' : 'Logged', icon: 'i-lucide-check', color: 'success' })
    logging.value = false
    await load()
  }
  catch (refused) {
    logFailure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

const reviewing = ref<string | null>(null)

async function markReviewed(entry: Entry): Promise<void> {
  reviewing.value = entry.id
  try {
    await $fetch(`/api/tonight/incidents/${entry.id}/review`, { method: 'POST' })
    toast.add({ title: 'Marked reviewed', icon: 'i-lucide-check', color: 'success' })
    await load()
  }
  catch (refused) {
    toast.add({ title: 'Not marked reviewed', description: refusalText(refused), icon: 'i-lucide-triangle-alert', color: 'error' })
  }
  finally {
    reviewing.value = null
  }
}

const correcting = ref<Entry | null>(null)
const correctForm = reactive<{ category: Category | null, severity: Severity | null, body: string }>({ category: 'OTHER', severity: 'NOTE', body: '' })
const correctFailure = ref<string | null>(null)
const correctReady = computed(() => Boolean(correctForm.category && correctForm.severity && correctForm.body.trim()))

function openCorrect(entry: Entry): void {
  correcting.value = entry
  Object.assign(correctForm, { category: entry.category, severity: entry.severity, body: entry.body })
  correctFailure.value = null
}

async function submitCorrect(): Promise<void> {
  if (!correcting.value) return
  saving.value = true
  correctFailure.value = null
  try {
    await $fetch(`/api/tonight/incidents/${correcting.value.id}/supersede`, { method: 'POST', body: { ...correctForm, happenedAt: null } })
    toast.add({ title: 'Correction filed', icon: 'i-lucide-check', color: 'success' })
    correcting.value = null
    await load()
  }
  catch (refused) {
    correctFailure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <NightScreen
      title="Contacts and incidents"
      :refused="refusal"
      hint="Every entry is timed, named and printed in the night report. A mistake is corrected with a new entry, never an edit."
      :empty="!settling && items.length === 0"
      :stale="syncedAt"
      :busy="settling"
    >
      <div class="space-y-5">
        <section>
          <h2 class="mb-3 font-mono text-xs tracking-[0.2em] text-muted uppercase">
            On tonight<span v-if="team.some(slot => slot.phone)"> · tap to call</span>
          </h2>
          <div
            class="space-y-2"
            data-test="tonight-team"
          >
            <p
              v-if="!waiting && team.length === 0"
              class="text-sm text-muted"
            >
              Nobody is on the rota tonight yet.
            </p>
            <div
              v-for="slot in team"
              :key="slot.shiftId"
              class="flex items-center gap-3 rounded-xl bg-elevated"
              :class="slot.filled ? 'p-4' : 'px-4 py-2'"
              :data-test="`team-${slot.role}`"
            >
              <span
                v-if="slot.filled"
                class="min-w-0 grow"
              >
                <span class="block truncate text-lg font-semibold">{{ slot.name }}</span>
                <span class="block text-sm text-muted">{{ saysShiftRole(slot.role) }}</span>
              </span>
              <!-- An unfilled slot or an unconfirmed claim stays in the list, one quiet line rather
                   than a card, so it reads as a gap in the rota and never as somebody to ring. -->
              <span
                v-else
                class="min-w-0 grow text-sm text-muted"
              >{{ saysShiftRole(slot.role) }} · {{ slot.claimed ? saysTeamHolder(slot) : 'unfilled' }}</span>
              <!-- Only where the member's own consent is set: nothing here reveals a number the
                   roster did not already carry (A-114). -->
              <UButton
                v-if="slot.phone"
                :to="telHref(slot.phone)"
                external
                color="secondary"
                variant="outline"
                icon="i-lucide-phone"
                size="xl"
                :aria-label="`Call ${slot.name}`"
                class="min-h-12 min-w-12 shrink-0 justify-center"
                :data-test="`call-${slot.role}`"
              />
            </div>
          </div>
        </section>

        <section>
          <h2 class="mb-3 font-mono text-xs tracking-[0.2em] text-muted uppercase">
            Incident log
          </h2>

          <UAlert
            v-if="failure"
            data-test="incidents-failure"
            color="error"
            variant="subtle"
            :description="failure"
          />

          <UAlert
            v-else-if="authorityFailure && performanceIds.length === 0"
            data-test="incidents-authority-failure"
            color="warning"
            variant="subtle"
            :description="authorityFailure"
          />

          <div
            v-else
            class="space-y-2"
            data-test="incidents-list"
          >
            <p
              v-if="!waiting && items.length === 0"
              class="text-muted"
            >
              Nothing logged yet tonight.
            </p>

            <div
              v-for="entry in items"
              :key="entry.id"
              class="space-y-1 rounded-xl bg-elevated p-4"
              :data-test="`incident-${entry.id}`"
            >
              <p>{{ entry.body }}</p>
              <p class="font-mono text-xs text-muted">
                {{ saysClock(entry.happenedAt) }} · logged by {{ entry.reportedByName }}
                · {{ saysCategory(entry.category) }}, {{ saysSeverity(entry.severity) }}
                <span v-if="entry.supersedesId"> · corrects an earlier entry</span>
                <span v-if="entry.supersededBy"> · corrected later</span>
                <span v-if="entry.reviewed"> · reviewed</span>
              </p>
              <div class="flex flex-wrap items-center gap-2">
                <!-- Offered to the duty manager alone, because the route takes that authority and
                     nothing here re-derives it from a standing grant (0009). -->
                <UButton
                  v-if="offersReview && !entry.reviewed"
                  color="secondary"
                  variant="outline"
                  class="min-h-12"
                  :loading="reviewing === entry.id"
                  :data-test="`review-${entry.id}`"
                  @click="markReviewed(entry)"
                >
                  Mark reviewed
                </UButton>
                <UButton
                  v-if="!entry.supersededBy"
                  color="neutral"
                  variant="ghost"
                  class="min-h-12"
                  :data-test="`correct-${entry.id}`"
                  @click="openCorrect(entry)"
                >
                  Correct this entry
                </UButton>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- Nothing to log until authority has answered, since it may yet refuse this viewer. -->
      <template
        v-if="!waiting"
        #actions
      >
        <!-- One action for anything worth writing down, a near miss already chosen (issue 1317). -->
        <NightAction
          label="Log something"
          icon="i-lucide-clipboard-pen"
          color="primary"
          :disabled="performanceIds.length === 0"
          data-test="open-log"
          @press="openLog"
        />
      </template>
    </NightScreen>

    <NightSheet
      v-model:open="logging"
      title="Log something"
      primary="Log it"
      primary-test-id="log-submit"
      :primary-disabled="!logReady"
      :loading="saving"
      @primary="submitLog"
    >
      <form
        class="space-y-4"
        data-test="log-form"
        @submit.prevent="submitLog"
      >
        <UAlert
          v-if="logFailure"
          data-test="log-failure"
          color="error"
          variant="subtle"
          :description="logFailure"
        />

        <NightChoices
          v-model="logForm.kind"
          label="What kind"
          :options="kindOptions"
          test-id="log-kind"
        />

        <NightChoices
          v-model="logForm.category"
          label="About"
          :options="categoryOptions"
          test-id="log-category"
        />

        <NightChoices
          v-if="performanceOptions.length > 1"
          v-model="logForm.performanceId"
          label="Performance"
          :options="performanceOptions"
          :columns="1"
          test-id="log-performance"
        />

        <UFormField
          :label="logForm.kind === 'NEAR_MISS' ? 'What nearly happened' : 'What happened'"
          description="People by role, never by name."
        >
          <UTextarea
            v-model="logForm.body"
            :rows="logForm.kind === 'NEAR_MISS' ? 2 : 4"
            class="w-full"
            data-test="log-body"
          />
        </UFormField>
      </form>
    </NightSheet>

    <NightSheet
      :open="correcting !== null"
      title="Correct this entry"
      primary="File the correction"
      primary-test-id="correct-submit"
      :primary-disabled="!correctReady"
      :loading="saving"
      @update:open="correcting = null"
      @primary="submitCorrect"
    >
      <form
        class="space-y-4"
        data-test="correct-form"
        @submit.prevent="submitCorrect"
      >
        <UAlert
          v-if="correctFailure"
          data-test="correct-failure"
          color="error"
          variant="subtle"
          :description="correctFailure"
        />

        <NightChoices
          v-model="correctForm.severity"
          label="What kind"
          :options="kindOptions"
          test-id="correct-severity"
        />

        <NightChoices
          v-model="correctForm.category"
          label="About"
          :options="categoryOptions"
          test-id="correct-category"
        />

        <UFormField label="Corrected account">
          <UTextarea
            v-model="correctForm.body"
            :rows="4"
            class="w-full"
            data-test="correct-body"
          />
        </UFormField>
      </form>
    </NightSheet>
  </div>
</template>
