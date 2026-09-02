<script setup lang="ts">
import { DELIVERY_ATTENDEES_MAX, saysSource } from '#shared/utils/training'

definePageMeta({ layout: 'console', title: 'Log a delivery', middleware: 'console' })

interface Module { id: string, name: string, status: string, signoffRequired: boolean }

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
const failure = ref<string | null>(null)
const working = ref(false)

const { data: catalogue } = await useAsyncData(
  'training-deliveries-modules',
  () => request<{ items: Module[] }>('/api/admin/training/modules'),
  { default: () => ({ items: [] as Module[] }) },
)

// What may be taught: active, and not proved by experience rather than by a room (G-112 c3).
const teachable = computed(() => catalogue.value.items.filter(module =>
  module.status === 'ACTIVE' && !module.signoffRequired))

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
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    working.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="failure"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-history"
      title="Teaching that happened away from the system still counts"
      description="Name the day, what was taught and who was there. Nothing is written until you have seen exactly what it would create, one record per person per module, dated to the day it was taught."
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
        </div>
      </UFormField>

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
