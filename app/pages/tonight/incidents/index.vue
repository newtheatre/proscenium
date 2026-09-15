<script setup lang="ts">
import { NIGHT_ROLES } from '#shared/utils/night-authority'
import type { NightRole } from '#shared/utils/night-authority'
import { CATEGORIES, SEVERITIES, saysCategory, saysSeverity } from '#shared/utils/incidents'
import { londonClock } from '#shared/utils/london'
import { saysShiftRole } from '#shared/utils/rota'
import { contactRoster, saysPerformanceChoice, telHref } from '#shared/utils/tonight'
import type { Category, Severity } from '#shared/utils/incidents'

definePageMeta({ layout: 'tonight', docs: '/docs/show-night/incidents' })
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

interface Listing { items: Entry[], total: number }

const request = useRequestFetch()
const toast = useToast()

const syncedAt = ref<Date | null>(null)
const failure = ref<string | null>(null)
const busy = ref(true)
const items = ref<Entry[]>([])
// What tonight's log is scoped to, resolved once on load: none of BAR, DOOR or DUTY_MANAGER is
// asked to name a performance, so the first role that resolves says which ones are running.
const performanceIds = ref<string[]>([])
// Named where the authority route says what is running, an id where it does not yet: a role can
// resolve a performance the route did not label.
const performances = ref<{ id: string, showTitle: string, startsAt: number }[]>([])
const authorityFailure = ref<string | null>(null)
// The role this screen actually resolved, which is what decides whether the review action is
// offered: the route behind it takes a duty manager and nobody else (E-114 criterion 3).
const resolvedRole = ref<NightRole | null>(null)

async function resolveAuthority(): Promise<void> {
  for (const role of NIGHT_ROLES) {
    try {
      const resolved = await request<{ performanceIds: string[], performances?: { id: string, showTitle: string, startsAt: number }[] }>('/api/tonight/authority', { query: { role } })
      performanceIds.value = resolved.performanceIds
      performances.value = resolved.performances ?? []
      resolvedRole.value = role
      authorityFailure.value = null
      return
    }
    catch (refused) {
      authorityFailure.value = refusalText(refused)
    }
  }
}

interface TeamSlot { role: NightRole, filled: boolean, name: string | null, phone: string | null }

const team = ref<TeamSlot[]>([])

// Best effort: a roster that will not load is a contacts block that says so, never a screen that
// refuses to show the log behind it.
async function loadTeam(): Promise<void> {
  try {
    const answered = await request<{ performances: { team: TeamSlot[] }[] }>('/api/tonight/team')
    team.value = contactRoster(answered.performances.flatMap(performance => performance.team))
  }
  catch { team.value = [] }
}

async function load(): Promise<void> {
  busy.value = true
  failure.value = null
  try {
    const listed = await request<Listing>('/api/tonight/incidents', { query: { pageSize: 100 } })
    items.value = listed.items
    syncedAt.value = new Date()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    busy.value = false
  }
}

onMounted(async () => {
  await resolveAuthority()
  await Promise.all([load(), loadTeam()])
})

const performanceOptions = computed(() => performanceIds.value.map((id) => {
  const named = performances.value.find(one => one.id === id)
  return { label: named ? saysPerformanceChoice(named) : id, value: id }
}))

interface FormState {
  performanceId: string
  category: Category
  severity: Severity
  body: string
}

const blankForm = (): FormState => ({
  performanceId: performanceIds.value[0] ?? '',
  category: 'OTHER',
  severity: 'NOTE',
  body: '',
})

const categoryOptions = CATEGORIES.map(value => ({ label: saysCategory(value), value }))
const severityOptions = SEVERITIES.map(value => ({ label: saysSeverity(value), value }))

const logging = ref(false)
const logForm = reactive<FormState>(blankForm())
const logFailure = ref<string | null>(null)
const saving = ref(false)

function openLog(): void {
  Object.assign(logForm, blankForm())
  logFailure.value = null
  logging.value = true
}

async function submitLog(): Promise<void> {
  saving.value = true
  logFailure.value = null
  try {
    await $fetch('/api/tonight/incidents', { method: 'POST', body: { ...logForm, happenedAt: null } })
    toast.add({ title: 'Incident logged', icon: 'i-lucide-check', color: 'success' })
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

// One tap to open, one to pick a category, one sentence: no severity and no timestamp field at
// all, since a near miss is always filed as it happens (E-117 criteria 1, 2).
const reportingNearMiss = ref(false)
const nearMiss = reactive({ performanceId: '', category: 'SAFETY' as Category, body: '' })
const nearMissFailure = ref<string | null>(null)

function openNearMiss(): void {
  nearMiss.performanceId = performanceIds.value[0] ?? ''
  nearMiss.category = 'SAFETY'
  nearMiss.body = ''
  nearMissFailure.value = null
  reportingNearMiss.value = true
}

async function submitNearMiss(): Promise<void> {
  saving.value = true
  nearMissFailure.value = null
  try {
    await $fetch('/api/tonight/incidents/near-miss', { method: 'POST', body: nearMiss })
    toast.add({ title: 'Near miss reported', description: 'Thank you for flagging it.', icon: 'i-lucide-check', color: 'success' })
    reportingNearMiss.value = false
    await load()
  }
  catch (refused) {
    nearMissFailure.value = refusalText(refused)
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
const correctForm = reactive<Omit<FormState, 'performanceId'>>({ category: 'OTHER', severity: 'NOTE', body: '' })
const correctFailure = ref<string | null>(null)

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
      :stale="syncedAt"
      :busy="busy"
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
              v-if="team.length === 0"
              class="text-sm text-muted"
            >
              Nobody is rostered on tonight yet.
            </p>
            <div
              v-for="slot in team"
              :key="`${slot.role}-${slot.name ?? 'unfilled'}`"
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
              <!-- An unfilled slot stays in the list, one quiet line rather than a card, so it
                   reads as a gap in the rota and never as somebody to ring. -->
              <span
                v-else
                class="min-w-0 grow text-sm text-muted"
              >{{ saysShiftRole(slot.role) }} · unfilled</span>
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
          <div class="mb-3 flex items-center justify-between gap-3">
            <h2 class="font-mono text-xs tracking-[0.2em] text-muted uppercase">
              Incident log
            </h2>
            <UButton
              color="secondary"
              icon="i-lucide-plus"
              class="min-h-12"
              :disabled="performanceIds.length === 0"
              data-test="open-log-incident-inline"
              @click="openLog"
            >
              Log incident
            </UButton>
          </div>

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
              v-if="items.length === 0"
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
                {{ londonClock(new Date(entry.happenedAt * 1000)) }} · logged by {{ entry.reportedByName }}
                · {{ saysCategory(entry.category) }}, {{ saysSeverity(entry.severity) }}
                <span v-if="entry.supersedesId"> · corrects an earlier entry</span>
                <span v-if="entry.supersededBy"> · superseded</span>
                <span v-if="entry.reviewed"> · reviewed</span>
              </p>
              <div class="flex flex-wrap items-center gap-2">
                <!-- Offered to the duty manager alone, because the route takes that authority and
                     nothing here re-derives it from a standing grant (0009). -->
                <UButton
                  v-if="resolvedRole === 'DUTY_MANAGER' && !entry.reviewed"
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
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :data-test="`correct-${entry.id}`"
                  @click="openCorrect(entry)"
                >
                  Correct this entry
                </UButton>
              </div>
            </div>
          </div>

          <p class="mt-3 text-center text-sm text-muted">
            Timestamped and named: entries land in the end-of-night report in full, and a mistake is
            corrected with a new entry, never an edit. The duty manager marks each one reviewed
            before the night closes.
          </p>
        </section>
      </div>

      <template #actions>
        <NightAction
          label="Report a near miss"
          icon="i-lucide-triangle-alert"
          color="neutral"
          :disabled="performanceIds.length === 0"
          data-test="open-near-miss"
          @press="openNearMiss"
        />
      </template>
    </NightScreen>

    <UModal
      v-model:open="logging"
      title="Log an incident"
      description="Timestamp, category, severity and a free-text account. The reporter is attributed automatically."
    >
      <template #body>
        <form
          class="space-y-4"
          data-test="log-incident-form"
          @submit.prevent="submitLog"
        >
          <UAlert
            v-if="logFailure"
            data-test="log-incident-failure"
            color="error"
            variant="subtle"
            :description="logFailure"
          />

          <UFormField
            v-if="performanceOptions.length > 1"
            label="Performance"
          >
            <USelect
              v-model="logForm.performanceId"
              :items="performanceOptions"
              class="w-full"
              data-test="log-performance"
            />
          </UFormField>

          <UFormField label="Category">
            <USelect
              v-model="logForm.category"
              :items="categoryOptions"
              class="w-full"
              data-test="log-category"
            />
          </UFormField>

          <UFormField label="Severity">
            <USelect
              v-model="logForm.severity"
              :items="severityOptions"
              class="w-full"
              data-test="log-severity"
            />
          </UFormField>

          <UFormField
            label="What happened"
            description="People by role, never by name."
          >
            <UTextarea
              v-model="logForm.body"
              :rows="4"
              class="w-full"
              data-test="log-body"
            />
          </UFormField>

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              :loading="saving"
              data-test="log-submit"
            >
              Log it
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="logging = false"
            >
              Back
            </UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal
      v-model:open="reportingNearMiss"
      title="Report a near miss"
      description="A category and a sentence. No severity to choose, and this never blocks anything else."
    >
      <template #body>
        <form
          class="space-y-4"
          data-test="near-miss-form"
          @submit.prevent="submitNearMiss"
        >
          <UAlert
            v-if="nearMissFailure"
            data-test="near-miss-failure"
            color="error"
            variant="subtle"
            :description="nearMissFailure"
          />

          <UFormField
            v-if="performanceOptions.length > 1"
            label="Performance"
          >
            <USelect
              v-model="nearMiss.performanceId"
              :items="performanceOptions"
              class="w-full"
              data-test="near-miss-performance"
            />
          </UFormField>

          <UFormField label="Category">
            <USelect
              v-model="nearMiss.category"
              :items="categoryOptions"
              class="w-full"
              data-test="near-miss-category"
            />
          </UFormField>

          <UFormField label="What nearly happened">
            <UInput
              v-model="nearMiss.body"
              class="w-full"
              data-test="near-miss-body"
            />
          </UFormField>

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              :loading="saving"
              data-test="near-miss-submit"
            >
              Report it
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="reportingNearMiss = false"
            >
              Back
            </UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal
      :open="correcting !== null"
      :title="correcting ? 'Correct this entry' : ''"
      description="This files a new entry naming what it supersedes. The original stays visible."
      @update:open="correcting = null"
    >
      <template #body>
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

          <UFormField label="Category">
            <USelect
              v-model="correctForm.category"
              :items="categoryOptions"
              class="w-full"
              data-test="correct-category"
            />
          </UFormField>

          <UFormField label="Severity">
            <USelect
              v-model="correctForm.severity"
              :items="severityOptions"
              class="w-full"
              data-test="correct-severity"
            />
          </UFormField>

          <UFormField label="Corrected account">
            <UTextarea
              v-model="correctForm.body"
              :rows="4"
              class="w-full"
              data-test="correct-body"
            />
          </UFormField>

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              :loading="saving"
              data-test="correct-submit"
            >
              File the correction
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="correcting = null"
            >
              Back
            </UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
