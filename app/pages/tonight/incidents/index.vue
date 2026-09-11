<script setup lang="ts">
import { NIGHT_ROLES } from '#shared/utils/night-authority'
import { CATEGORIES, SEVERITIES, saysCategory, saysSeverity } from '#shared/utils/incidents'
import { londonClock } from '#shared/utils/london'
import type { Category, Severity } from '#shared/utils/incidents'

definePageMeta({ layout: 'tonight' })
useSeoMeta({ title: 'Incident log' })

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
// Named where the authority route says what is running, an id where it does not yet: #953 adds
// `performances` and a shared label, and this falls back until that lands.
const performances = ref<{ id: string, showTitle: string, startsAt: number }[]>([])
const authorityFailure = ref<string | null>(null)

async function resolveAuthority(): Promise<void> {
  for (const role of NIGHT_ROLES) {
    try {
      const resolved = await request<{ performanceIds: string[], performances?: { id: string, showTitle: string, startsAt: number }[] }>('/api/tonight/authority', { query: { role } })
      performanceIds.value = resolved.performanceIds
      performances.value = resolved.performances ?? []
      authorityFailure.value = null
      return
    }
    catch (refused) {
      authorityFailure.value = refusalText(refused)
    }
  }
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
  await load()
})

const performanceOptions = computed(() => performanceIds.value.map((id) => {
  const named = performances.value.find(one => one.id === id)
  return { label: named ? `${named.showTitle}, ${londonClock(new Date(named.startsAt * 1000))}` : id, value: id }
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
      title="Incident log"
      hint="Every entry stays visible once filed. A mistake is corrected with a new entry, never an edit."
      :stale="syncedAt"
      :busy="busy"
    >
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
        class="space-y-3"
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
          class="space-y-1 rounded-lg border border-default p-3"
          :data-test="`incident-${entry.id}`"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-sm font-semibold">{{ saysCategory(entry.category) }} · {{ saysSeverity(entry.severity) }}</span>
            <span class="text-xs text-muted">{{ londonClock(new Date(entry.happenedAt * 1000)) }}</span>
          </div>
          <p class="text-sm">
            {{ entry.body }}
          </p>
          <p class="text-xs text-muted">
            Reported by {{ entry.reportedByName }}
            <span v-if="entry.supersedesId"> · corrects an earlier entry</span>
            <span v-if="entry.supersededBy"> · superseded</span>
          </p>
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

      <template #actions>
        <NightAction
          label="Log an incident"
          icon="i-lucide-clipboard-list"
          color="primary"
          :disabled="performanceIds.length === 0"
          data-test="open-log-incident"
          @press="openLog"
        />
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
