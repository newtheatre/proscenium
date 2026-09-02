<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { fromLondonWallClock } from '#shared/utils/london'
import { DELIVERY_ATTENDEES_MAX, SESSION_CAPACITY_MAX, SESSION_CAPACITY_MIN, saysSessionStatus, saysSource, sessionForm } from '#shared/utils/training'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'
import type { SessionInput } from '#shared/utils/training'

definePageMeta({ layout: 'console', title: 'Training sessions', middleware: 'console' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

interface Session {
  id: string
  heldOn: string
  startsAt: string
  endsAt: string
  place: string | null
  capacity: number
  opensAt: number | null
  status: string
  trainerName: string
  modules: { id: string, name: string }[]
}

interface Module { id: string, name: string, status: string, signoffRequired: boolean, kind: string }

interface PlannedRecord {
  userId: string
  name: string
  moduleId: string
  moduleName: string
  awardedOn: string
  expiresOn: string | null
  alreadyHeld: boolean
}

interface PlannedGap {
  key: string
  userId: string
  name: string
  moduleId: string
  moduleName: string
  requiresId: string
  requiresName: string
  severity: string
}

interface Plan {
  heldOn: string
  records: PlannedRecord[]
  gaps: PlannedGap[]
  creates: number
  blocked: boolean
}

const request = useRequestFetch()
const toast = useToast()
const search = ref('')
const mine = ref(false)
const failure = ref<string | null>(null)
const saving = ref(false)

const { data, status, refresh } = await useAsyncData(
  'training-sessions',
  () => request<{ items: Session[] }>('/api/admin/training/sessions', { query: { mine: mine.value } }),
  { watch: [mine], default: (): { items: Session[] } => ({ items: [] }) },
)

const { data: catalogue } = await useAsyncData(
  'training-sessions-modules',
  () => request<{ items: Module[] }>('/api/admin/training/modules'),
  { default: () => ({ items: [] as Module[] }) },
)

// What may be taught: active, and not proved by experience rather than by a session (G-112 c3).
const teachable = computed(() => catalogue.value.items.filter(module =>
  module.status === 'ACTIVE' && !module.signoffRequired))

const shown = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return data.value.items
  return data.value.items.filter(session =>
    [session.heldOn, session.place ?? '', session.trainerName, ...session.modules.map(m => m.id)]
      .some(field => field.toLowerCase().includes(term)))
})

const open = ref(false)
const state = reactive<{
  heldOn: string
  startsAt: string
  endsAt: string
  place?: string
  capacity: number
  notes?: string
  moduleIds: string[]
  opensAt?: number | null
}>({ heldOn: '', startsAt: '19:00', endsAt: '21:00', capacity: 20, moduleIds: [], opensAt: null })

// Sign-up opening is one instant on the wire. It is collected as a day and a wall clock, read in
// London like every other domain date (0014), because a browser in another zone would be wrong.
const opensNow = ref(true)
const opensOnDay = ref('')
const opensAtTime = ref('09:00')

const opensAtReady = computed(() =>
  opensNow.value || Boolean(opensOnDay.value && /^\d{2}:\d{2}$/.test(opensAtTime.value)))

watchEffect(() => {
  if (opensNow.value || !opensAtReady.value) {
    state.opensAt = null
    return
  }
  const [year, month, day] = opensOnDay.value.split('-').map(Number)
  const [hour, minute] = opensAtTime.value.split(':').map(Number)
  state.opensAt = Math.floor(
    fromLondonWallClock(year!, month!, day!, hour!, minute!).getTime() / 1000,
  )
})

function begin(): void {
  Object.assign(state, {
    heldOn: '',
    startsAt: '19:00',
    endsAt: '21:00',
    place: undefined,
    capacity: 20,
    notes: undefined,
    moduleIds: [],
    opensAt: null,
  })
  opensNow.value = true
  opensOnDay.value = ''
  opensAtTime.value = '09:00'
  failure.value = null
  open.value = true
}

function toggle(id: string): void {
  state.moduleIds = state.moduleIds.includes(id)
    ? state.moduleIds.filter(one => one !== id)
    : [...state.moduleIds, id]
}

async function save(event: FormSubmitEvent<SessionInput>): Promise<void> {
  saving.value = true
  failure.value = null
  try {
    await $fetch('/api/admin/training/sessions', { method: 'POST', body: event.data })
    toast.add({ title: 'Session scheduled', icon: 'i-lucide-check', color: 'success' })
    open.value = false
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    saving.value = false
  }
}

const logging = ref(false)
const working = ref(false)
const heldOn = ref('')
const moduleIds = ref<string[]>([])
const attendees = ref<{ id: string, name: string }[]>([])
const person = ref<string | undefined>(undefined)
const picked = ref<{ id: string, name: string } | null>(null)

const plan = ref<Plan | null>(null)
const ticked = ref<string[]>([])

// The dry-run answers for the log as it was when it ran, so changing any of it puts the preview
// back (G-118 criterion 2).
watch([heldOn, moduleIds, attendees], () => {
  plan.value = null
  ticked.value = []
}, { deep: true })

const ready = computed(() =>
  Boolean(heldOn.value) && moduleIds.value.length > 0 && attendees.value.length > 0)

const blocking = computed(() => plan.value?.gaps.filter(gap => gap.severity === 'BLOCKS') ?? [])
const asking = computed(() => plan.value?.gaps.filter(gap => gap.severity !== 'BLOCKS') ?? [])
const outstanding = computed(() => asking.value.filter(gap => !ticked.value.includes(gap.key)))

const loggable = computed(() => Boolean(plan.value)
  && !plan.value!.blocked
  && plan.value!.creates > 0
  && outstanding.value.length === 0)

function beginLog(): void {
  heldOn.value = ''
  moduleIds.value = []
  attendees.value = []
  person.value = undefined
  picked.value = null
  plan.value = null
  ticked.value = []
  byEmail.value = false
  address.value = ''
  theirName.value = ''
  failure.value = null
  logging.value = true
}

function toggleModule(id: string): void {
  moduleIds.value = moduleIds.value.includes(id)
    ? moduleIds.value.filter(one => one !== id)
    : [...moduleIds.value, id]
}

function addPerson(): void {
  const chosen = picked.value
  if (!chosen || attendees.value.some(one => one.id === chosen.id)) return
  attendees.value = [...attendees.value, chosen]
  person.value = undefined
  picked.value = null
}

const byEmail = ref(false)
const address = ref('')
const theirName = ref('')

// Teaching that happened off-system was often taught to people who had not signed in yet, so the
// log needs the same door the register has (G-117, widened).
async function addByEmail(): Promise<void> {
  if (!address.value.trim()) return
  working.value = true
  failure.value = null
  try {
    const found = await $fetch<{ id: string, name: string }>('/api/admin/training/attendees/lookup', {
      method: 'POST',
      body: { email: address.value.trim(), name: theirName.value.trim() || undefined },
    })
    if (!attendees.value.some(one => one.id === found.id)) {
      attendees.value = [...attendees.value, { id: found.id, name: found.name }]
    }
    address.value = ''
    theirName.value = ''
    byEmail.value = false
  }
  catch (caught) {
    failure.value = refusalText(caught)
  }
  finally {
    working.value = false
  }
}

function removePerson(id: string): void {
  attendees.value = attendees.value.filter(one => one.id !== id)
}

function acknowledge(key: string, checked: boolean): void {
  ticked.value = checked ? [...new Set([...ticked.value, key])] : ticked.value.filter(one => one !== key)
}

async function preview(): Promise<void> {
  working.value = true
  failure.value = null
  try {
    plan.value = await $fetch<Plan>('/api/admin/training/deliveries/preview', {
      method: 'POST',
      body: { heldOn: heldOn.value, moduleIds: moduleIds.value, userIds: attendees.value.map(one => one.id) },
    })
    ticked.value = []
  }
  catch (error) {
    plan.value = null
    failure.value = refusalText(error)
  }
  finally {
    working.value = false
  }
}

async function log(): Promise<void> {
  if (!plan.value) return
  working.value = true
  failure.value = null
  try {
    const answered = await $fetch<{ created: number }>('/api/admin/training/deliveries', {
      method: 'POST',
      body: {
        heldOn: heldOn.value,
        moduleIds: moduleIds.value,
        userIds: attendees.value.map(one => one.id),
        expectedCount: plan.value.creates,
        acknowledged: ticked.value,
      },
    })
    toast.add({
      title: 'Logged',
      description: `${plural(answered.created, 'record')} awarded, dated ${heldOn.value}.`,
      icon: 'i-lucide-check',
      color: 'success',
    })
    plan.value = null
    moduleIds.value = []
    attendees.value = []
    heldOn.value = ''
    logging.value = false
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    working.value = false
  }
}

// A page alert renders behind an open modal's overlay, where nobody can read it, so a refusal is
// shown wherever the action was taken and dropped when that modal closes.
const modalOpen = computed(() => open.value || logging.value)

watch(modalOpen, (nowOpen) => {
  if (!nowOpen) failure.value = null
})

const activeFilters = computed<ActiveFilter[]>(() => {
  const active: ActiveFilter[] = []
  if (search.value) {
    active.push({ key: 'search', label: `Matching ${search.value}`, icon: 'i-lucide-search', clear: () => {
      search.value = ''
    } })
  }
  if (mine.value) {
    active.push({ key: 'mine', label: 'Mine only', icon: 'i-lucide-user', clear: () => {
      mine.value = false
    } })
  }
  return active
})

const columns: TableColumn<Session>[] = [
  {
    id: 'when',
    header: 'When',
    meta: { class: { td: 'whitespace-nowrap' } },
    cell: ({ row }) => h('div', {}, [
      h('div', {}, row.original.heldOn),
      h('div', { class: 'text-xs text-muted' }, `${row.original.startsAt} to ${row.original.endsAt}`),
    ]),
  },
  {
    id: 'teaches',
    header: 'Teaches',
    cell: ({ row }) => h('div', {}, [
      h('div', { class: 'flex flex-wrap gap-1' }, row.original.modules.map(module =>
        h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => module.id))),
      h('div', { class: 'mt-1 text-xs text-muted' },
        `${row.original.trainerName}${row.original.place ? ` · ${row.original.place}` : ''}`),
    ]),
  },
  {
    id: 'capacity',
    header: 'Holds',
    meta: { class: { td: 'text-sm text-muted whitespace-nowrap' } },
    cell: ({ row }) => plural(row.original.capacity, 'place'),
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => h(UBadge, {
      color: row.original.status === 'OPEN' ? 'success' : row.original.status === 'CANCELLED' ? 'error' : 'neutral',
      variant: 'subtle',
      size: 'sm',
    }, () => saysSessionStatus(row.original.status)),
  },
  {
    id: 'open',
    header: '',
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => h(UButton, {
      'to': `/training/manage/sessions/${row.original.id}`,
      'variant': 'ghost',
      'size': 'sm',
      'icon': 'i-lucide-chevron-right',
      'data-test': `open-${row.original.id}`,
      'aria-label': `Open the session on ${row.original.heldOn}`,
    }),
  },
]
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="failure && !modalOpen"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-calendar-days"
      title="Teaching is planned, and running one is earned"
      description="Scheduling a session needs a current trainer certification, and you may teach only what you hold. A certification is not taught by session: it is signed off on experience gained outside training."
    />

    <AdminToolbar
      v-model:search="search"
      placeholder="A date, a place, a trainer or a module id"
      :active="activeFilters"
      :loading="status === 'pending'"
      @clear="search = ''; mine = false"
    >
      <template #filters>
        <UFormField label="Show">
          <USwitch
            v-model="mine"
            label="Only sessions I am running"
            data-test="sessions-mine"
          />
        </UFormField>
      </template>

      <template #actions>
        <UButton
          data-test="add-session"
          icon="i-lucide-plus"
          :disabled="teachable.length === 0"
          @click="begin"
        >
          Schedule a session
        </UButton>
        <UButton
          data-test="log-session"
          icon="i-lucide-history"
          color="neutral"
          variant="outline"
          :disabled="teachable.length === 0"
          @click="beginLog"
        >
          Log a session
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="shown"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="sessions-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          Nothing scheduled. A session needs a date, a time, a room's worth of places and something to teach.
        </p>
      </template>
    </UTable>

    <p
      data-test="sessions-total"
      class="text-sm text-muted"
    >
      {{ plural(shown.length, 'session') }}
    </p>

    <UModal
      v-model:open="open"
      title="Schedule a session"
      description="A future day, a London wall clock, and one or more modules you hold."
    >
      <template #body>
        <UAlert
          v-if="failure"
          data-test="failure"
          class="mb-4"
          color="error"
          variant="subtle"
          :description="failure"
        />

        <UForm
          :schema="sessionForm"
          :state="state"
          class="space-y-4"
          data-test="session-form"
          @submit="save"
        >
          <UFormField
            label="Day"
            name="heldOn"
            required
          >
            <DateField
              v-model="state.heldOn"
              data-test="session-day"
              class="w-full"
            />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              label="Starts"
              name="startsAt"
              required
            >
              <UInput
                v-model="state.startsAt"
                placeholder="19:00"
                class="w-full"
                data-test="session-starts"
              />
            </UFormField>
            <UFormField
              label="Ends"
              name="endsAt"
              required
            >
              <UInput
                v-model="state.endsAt"
                placeholder="21:00"
                class="w-full"
                data-test="session-ends"
              />
            </UFormField>
          </div>

          <UFormField
            label="Where"
            name="place"
            hint="Optional"
          >
            <UInput
              v-model="state.place"
              class="w-full"
              data-test="session-place"
            />
          </UFormField>

          <UFormField
            label="Places"
            name="capacity"
            required
            :description="`Between ${SESSION_CAPACITY_MIN} and ${SESSION_CAPACITY_MAX}.`"
          >
            <UInputNumber
              v-model="state.capacity"
              :min="SESSION_CAPACITY_MIN"
              :max="SESSION_CAPACITY_MAX"
              class="w-full"
              data-test="session-capacity"
            />
          </UFormField>

          <UFormField
            label="What it teaches"
            name="moduleIds"
            required
            description="You may teach only what you currently hold. Certifications are not taught by session."
          >
            <div class="flex flex-wrap gap-1">
              <UButton
                v-for="module in teachable"
                :key="module.id"
                size="sm"
                :color="state.moduleIds.includes(module.id) ? 'primary' : 'neutral'"
                :variant="state.moduleIds.includes(module.id) ? 'solid' : 'outline'"
                :aria-pressed="state.moduleIds.includes(module.id)"
                :data-test="`session-module-${module.id}`"
                @click="toggle(module.id)"
              >
                {{ module.id }}
              </UButton>
            </div>
          </UFormField>

          <UFormField
            label="Notes"
            name="notes"
            hint="Optional"
          >
            <UTextarea
              v-model="state.notes"
              :rows="2"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Sign-up">
            <USwitch
              v-model="opensNow"
              data-test="session-opens-now"
              label="Open for sign-up as soon as it is saved"
              description="Turn this off to finish the details first. A planned session is invisible to members until it opens."
            />
          </UFormField>

          <div
            v-if="!opensNow"
            class="grid gap-4 sm:grid-cols-2"
          >
            <UFormField
              label="Opens on"
              required
            >
              <DateField
                v-model="opensOnDay"
                data-test="session-opens-day"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="At"
              required
            >
              <TimeField
                v-model="opensAtTime"
                class="w-full"
                data-test="session-opens-time"
              />
            </UFormField>
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              :loading="saving"
              :disabled="!opensAtReady"
              data-test="session-submit"
            >
              Schedule it
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="open = false"
            >
              Back
            </UButton>
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal
      v-model:open="logging"
      title="Log a session"
      description="Teaching that already happened, away from the system. Nothing is written until you have seen exactly what it would create, one record per person per module, dated to the day it was taught."
    >
      <template #body>
        <div class="space-y-6">
          <UAlert
            v-if="failure"
            data-test="failure"
            color="error"
            variant="subtle"
            :description="failure"
          />

          <div
            data-test="delivery-form"
            class="space-y-4"
          >
            <UFormField
              label="The day it was taught"
              required
              description="A past day, read in London time. An award is never dated ahead of today."
            >
              <DateField
                v-model="heldOn"
                data-test="delivery-day"
                class="w-full sm:w-64"
              />
            </UFormField>

            <UFormField
              label="What was taught"
              required
              description="You may log only what you currently hold. Certifications are signed off, not taught."
            >
              <div class="flex flex-wrap gap-1">
                <UButton
                  v-for="module in teachable"
                  :key="module.id"
                  size="sm"
                  :color="moduleIds.includes(module.id) ? 'primary' : 'neutral'"
                  :variant="moduleIds.includes(module.id) ? 'solid' : 'outline'"
                  :aria-pressed="moduleIds.includes(module.id)"
                  :data-test="`delivery-module-${module.id}`"
                  @click="toggleModule(module.id)"
                >
                  {{ module.id }}
                </UButton>
              </div>
            </UFormField>

            <UFormField
              label="Who was there"
              required
              :description="`Up to ${DELIVERY_ATTENDEES_MAX} people, added one at a time.`"
            >
              <div class="flex flex-wrap items-start gap-2">
                <PersonPicker
                  v-model="person"
                  data-test="delivery-person"
                  class="w-full sm:w-96"
                  @chosen="value => picked = value"
                />
                <UButton
                  icon="i-lucide-plus"
                  color="neutral"
                  variant="outline"
                  :disabled="!picked || attendees.length >= DELIVERY_ATTENDEES_MAX"
                  data-test="delivery-add-person"
                  @click="addPerson"
                >
                  Add
                </UButton>
                <UButton
                  icon="i-lucide-mail"
                  color="neutral"
                  variant="ghost"
                  :disabled="attendees.length >= DELIVERY_ATTENDEES_MAX"
                  data-test="delivery-by-email"
                  @click="byEmail = !byEmail"
                >
                  By address
                </UButton>
              </div>
            </UFormField>

            <div
              v-if="byEmail"
              class="space-y-3 rounded-md border border-default p-3"
              data-test="delivery-email-panel"
            >
              <p class="text-sm text-muted">
                For somebody who has never signed in. They get an account they can claim later, and
                this training is waiting on it.
              </p>
              <div class="grid gap-3 sm:grid-cols-2">
                <UFormField label="Address">
                  <UInput
                    v-model="address"
                    type="email"
                    placeholder="name@nottingham.ac.uk"
                    class="w-full"
                    data-test="delivery-email"
                  />
                </UFormField>
                <UFormField
                  label="Their name"
                  hint="Optional"
                >
                  <UInput
                    v-model="theirName"
                    class="w-full"
                    data-test="delivery-email-name"
                  />
                </UFormField>
              </div>
              <UButton
                :loading="working"
                :disabled="!address.trim()"
                data-test="delivery-email-add"
                @click="addByEmail"
              >
                Add them
              </UButton>
            </div>

            <div
              v-if="attendees.length"
              class="flex flex-wrap gap-1"
              data-test="delivery-attendees"
            >
              <UButton
                v-for="one in attendees"
                :key="one.id"
                size="sm"
                color="neutral"
                variant="soft"
                trailing-icon="i-lucide-x"
                :data-test="`delivery-remove-${one.id}`"
                @click="removePerson(one.id)"
              >
                {{ one.name }}
              </UButton>
            </div>

            <div class="flex flex-wrap gap-2">
              <UButton
                :disabled="!ready"
                :loading="working"
                icon="i-lucide-eye"
                data-test="delivery-preview"
                @click="preview"
              >
                Show me what this creates
              </UButton>
            </div>
          </div>

          <div
            v-if="plan"
            data-test="delivery-plan"
            class="space-y-4"
          >
            <USeparator />

            <h2 class="text-lg font-semibold">
              What this would create
            </h2>

            <UAlert
              v-if="blocking.length"
              color="error"
              variant="subtle"
              icon="i-lucide-shield-alert"
              title="Safety-critical training needs its prerequisites first"
              :description="`This cannot be logged until they are held: ${blocking.map(gap => `${gap.name} needs ${gap.requiresId} ${gap.requiresName} for ${gap.moduleId}`).join('; ')}.`"
            />

            <div
              v-if="asking.length"
              class="space-y-2"
            >
              <p class="text-sm text-muted">
                Please confirm each of these before logging. They are not blocking, and they are yours to
                judge.
              </p>
              <UCheckbox
                v-for="gap in asking"
                :key="gap.key"
                :model-value="ticked.includes(gap.key)"
                :data-test="`delivery-ack-${gap.key}`"
                :label="`${gap.name} does not hold ${gap.requiresId} ${gap.requiresName}, needed for ${gap.moduleId} ${gap.moduleName}`"
                @update:model-value="value => acknowledge(gap.key, value === true)"
              />
            </div>

            <ul class="divide-y divide-default rounded-md border border-default">
              <li
                v-for="record in plan.records"
                :key="`${record.userId}-${record.moduleId}`"
                class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span>
                  {{ record.name }}
                  <span class="font-mono text-xs text-muted">{{ record.moduleId }}</span>
                  {{ record.moduleName }}
                </span>
                <span class="flex items-center gap-2 text-xs text-muted">
                  <span>Awarded {{ record.awardedOn }}</span>
                  <span>{{ record.expiresOn ? `Runs to ${record.expiresOn}` : 'Never expires' }}</span>
                  <UBadge
                    v-if="record.alreadyHeld"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                  >
                    Already recorded
                  </UBadge>
                  <UBadge
                    v-else
                    color="success"
                    variant="subtle"
                    size="sm"
                  >
                    {{ saysSource('SESSION') }}
                  </UBadge>
                </span>
              </li>
            </ul>

            <p class="text-sm text-muted">
              {{ plural(plan.creates, 'record') }} would be created.
              {{ plan.records.length - plan.creates > 0
                ? `${plural(plan.records.length - plan.creates, 'record')} already exist for that day and would not be written again.`
                : '' }}
            </p>

            <div class="flex flex-wrap gap-2">
              <UButton
                :disabled="!loggable"
                :loading="working"
                data-test="delivery-submit"
                @click="log"
              >
                Log it
              </UButton>
              <UButton
                color="neutral"
                variant="ghost"
                @click="plan = null"
              >
                Back
              </UButton>
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
