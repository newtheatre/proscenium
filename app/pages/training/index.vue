<script setup lang="ts">
import { REQUEST_NOTE_LIMIT, saysKind, saysRequestStatus, saysSource, saysState } from '#shared/utils/training'
import type { RecordState } from '#shared/utils/training'

definePageMeta({ layout: 'member', middleware: 'signed-in' })

interface Record {
  id: string
  moduleId: string
  moduleName: string
  department: string
  kind: string
  awardedOn: string
  expiresOn: string | null
  source: string
  state: RecordState | null
  held: boolean
}

const request = useRequestFetch()

interface Standing { trainer: boolean, supervisor: boolean }

interface NextStep {
  id: string
  name: string
  department: string
  kind: string
  safetyCritical: boolean
}

const { data, status } = await useAsyncData(
  'training-records',
  () => request<{ items: Record[], total: number, standing: Standing }>('/api/training/records'),
  { default: () => ({ items: [] as Record[], total: 0, standing: { trainer: false, supervisor: false } }) },
)

// Grouped by department, which is how a member thinks about what they are allowed to do
// (G-101 criterion 1). Order follows the server's, newest award first inside each group.
const groups = computed(() => {
  const byDepartment = new Map<string, Record[]>()
  for (const record of data.value.items) {
    byDepartment.set(record.department, [...(byDepartment.get(record.department) ?? []), record])
  }
  return [...byDepartment.entries()].sort(([a], [b]) => a.localeCompare(b))
})

interface Ask {
  id: string
  moduleId: string
  moduleName: string
  department: string
  note: string | null
  status: string
  reason: string | null
}

const toast = useToast()
const asking = ref<string | null>(null)
const note = ref('')
const failure = ref<string | null>(null)

const { data: asks, refresh: refreshAsks } = await useAsyncData(
  'training-requests',
  () => request<{ items: Ask[] }>('/api/training/requests'),
  { default: () => ({ items: [] as Ask[] }) },
)

const openAsks = computed(() => new Set(
  asks.value.items.filter(one => one.status === 'OPEN').map(one => one.moduleId),
))

// What is expired, and what is expiring, said before anything else. Their absence would otherwise
// read as "nothing is expiring", which is not an answer a failed read may give.
const expired = computed(() => data.value.items.filter(one => one.state === 'EXPIRED'))
const expiring = computed(() => data.value.items.filter(one => one.state === 'EXPIRING'))

async function askFor(moduleId: string): Promise<void> {
  failure.value = null
  try {
    await $fetch('/api/training/requests', {
      method: 'POST',
      body: { moduleId, note: note.value.trim() || undefined },
    })
    toast.add({
      title: 'Asked',
      description: 'A lead will see it on their board.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    asking.value = null
    note.value = ''
    await refreshAsks()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
}

async function withdraw(id: string): Promise<void> {
  failure.value = null
  try {
    await $fetch(`/api/training/requests/${id}`, { method: 'DELETE' })
    await refreshAsks()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
}

const { data: next } = await useAsyncData(
  'training-next',
  () => request<{ items: NextStep[] }>('/api/training/next'),
  { default: () => ({ items: [] as NextStep[] }) },
)

const badge = (state: RecordState): 'success' | 'warning' | 'neutral' =>
  state === 'VALID' ? 'success' : state === 'EXPIRING' ? 'warning' : 'neutral'

// Said out loud because it is derived: it follows the certification and needs no revoking.
const standings = computed(() => [
  ...(data.value.standing.trainer ? ['run training sessions'] : []),
  ...(data.value.standing.supervisor ? ['supervise'] : []),
])
</script>

<template>
  <UContainer
    class="max-w-3xl py-16"
    data-test="training-page"
  >
    <UPageHeader
      title="My training"
      description="What you hold, and how long each one is good for. Something expiring still counts until its date."
    />

    <UAlert
      v-if="failure"
      class="mt-6"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <!-- Anything needing attention comes first: it is why a member opens this page at all. -->
    <UAlert
      v-if="expired.length > 0"
      class="mt-6"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      data-test="expired-alert"
      :title="expired.length === 1 ? 'One module has expired' : `${expired.length} modules have expired`"
    >
      <template #description>
        <p>
          It has not been taken away: it has stopped counting towards the things that need it.
        </p>
        <div class="mt-2 flex flex-wrap gap-2">
          <UButton
            v-for="record in expired"
            :key="record.id"
            size="xs"
            color="error"
            variant="outline"
            :disabled="openAsks.has(record.moduleId)"
            :data-test="`ask-expired-${record.moduleId}`"
            @click="asking = record.moduleId"
          >
            {{ openAsks.has(record.moduleId) ? `Asked for ${record.moduleId}` : `Ask for ${record.moduleId}` }}
          </UButton>
        </div>
      </template>
    </UAlert>

    <UAlert
      v-if="expiring.length > 0"
      class="mt-6"
      color="warning"
      variant="subtle"
      icon="i-lucide-clock-alert"
      data-test="expiring-alert"
      :title="expiring.length === 1 ? 'One module needs renewing soon' : `${expiring.length} modules need renewing soon`"
    >
      <template #description>
        <p>
          {{ expiring.length === 1 ? 'It still counts' : 'They still count' }} until the date shown, so
          there is nothing to do today.
        </p>
        <div class="mt-2 flex flex-wrap gap-2">
          <UButton
            v-for="record in expiring"
            :key="record.id"
            size="xs"
            color="warning"
            variant="outline"
            :disabled="openAsks.has(record.moduleId)"
            :data-test="`ask-expiring-${record.moduleId}`"
            @click="asking = record.moduleId"
          >
            {{ openAsks.has(record.moduleId) ? `Asked for ${record.moduleId}` : `Ask for ${record.moduleId}` }}
          </UButton>
        </div>
      </template>
    </UAlert>

    <UAlert
      v-if="standings.length > 0"
      class="mt-8"
      color="primary"
      variant="subtle"
      icon="i-lucide-badge-check"
      data-test="standing"
      :title="`You can ${standings.join(' and ')}`"
      description="This follows your certification: it lasts exactly as long as that record does."
    />

    <div
      v-if="status === 'pending'"
      class="mt-8 flex items-center gap-3 text-muted"
      data-test="records-loading"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="animate-spin"
      />
      Reading your records
    </div>

    <p
      v-else-if="groups.length === 0"
      class="mt-8 text-muted"
      data-test="records-empty"
    >
      You hold no training records yet. They appear here as you earn them.
    </p>

    <div
      v-else
      class="mt-8 space-y-8"
      data-test="records"
    >
      <section
        v-for="[department, records] in groups"
        :key="department"
      >
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wide">
          {{ department }}
        </h2>

        <ul class="mt-3 space-y-3">
          <li
            v-for="record in records"
            :key="record.id"
            class="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-default p-4"
            :data-test="`record-${record.moduleId}`"
          >
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-sm text-muted">{{ record.moduleId }}</span>
                <span class="font-medium">{{ record.moduleName }}</span>
                <UBadge
                  v-if="record.state"
                  :color="badge(record.state)"
                  variant="subtle"
                  size="sm"
                  :data-test="`state-${record.moduleId}`"
                >
                  {{ saysState(record.state) }}
                </UBadge>
              </div>
              <p class="mt-1 text-sm text-muted">
                <!-- How it was come by, because a certificate we recorded is not one we ran (G-121 c4). -->
                {{ saysKind(record.kind) }} · {{ saysSource(record.source) }} · Awarded {{ record.awardedOn }}
                <!-- A brief never expires, so it shows what it is instead of a date (criterion 5). -->
                <template v-if="record.kind === 'BRIEF'">
                  · Last attended
                </template>
                <template v-else-if="record.expiresOn">
                  · Runs to {{ record.expiresOn }}
                </template>
                <template v-else>
                  · Never expires
                </template>
              </p>
            </div>
          </li>
        </ul>
      </section>
    </div>

    <section
      v-if="next.items.length > 0"
      class="mt-12"
      data-test="whats-next"
    >
      <h2 class="text-sm font-semibold text-muted uppercase tracking-wide">
        What you could do next
      </h2>
      <p class="mt-1 text-sm text-muted">
        Everything here is open to you now: you hold what it asks for. Something expiring still
        counts, so a renewal can wait until its date.
      </p>

      <ul class="mt-3 space-y-3">
        <li
          v-for="step in next.items"
          :key="step.id"
          class="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-default p-4"
          :data-test="`next-${step.id}`"
        >
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-mono text-sm text-muted">{{ step.id }}</span>
              <span class="font-medium">{{ step.name }}</span>
              <UBadge
                v-if="step.safetyCritical"
                color="warning"
                variant="subtle"
                size="sm"
              >
                Safety critical
              </UBadge>
            </div>
            <p class="mt-1 text-sm text-muted">
              {{ step.department }} · {{ saysKind(step.kind) }}
            </p>
          </div>
        </li>
      </ul>
    </section>
    <section
      v-if="asks.items.length > 0"
      class="mt-12"
      data-test="my-asks"
    >
      <h2 class="text-sm font-semibold text-muted uppercase tracking-wide">
        What you have asked for
      </h2>
      <p class="mt-1 text-sm text-muted">
        Asking tells the department there is demand. It holds no place and no priority.
      </p>

      <ul class="mt-3 space-y-3">
        <li
          v-for="ask in asks.items"
          :key="ask.id"
          class="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-default p-4"
          :data-test="`ask-${ask.moduleId}`"
        >
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-mono text-sm text-muted">{{ ask.moduleId }}</span>
              <span class="font-medium">{{ ask.moduleName }}</span>
              <UBadge
                :color="ask.status === 'SCHEDULED' ? 'success' : ask.status === 'OPEN' ? 'warning' : 'neutral'"
                variant="subtle"
                size="sm"
              >
                {{ saysRequestStatus(ask.status) }}
              </UBadge>
            </div>
            <p
              v-if="ask.reason"
              class="mt-1 text-sm text-muted"
            >
              {{ ask.reason }}
            </p>
          </div>
          <UButton
            v-if="ask.status === 'OPEN'"
            size="xs"
            color="neutral"
            variant="ghost"
            :data-test="`withdraw-${ask.moduleId}`"
            @click="withdraw(ask.id)"
          >
            Withdraw
          </UButton>
        </li>
      </ul>
    </section>

    <UModal
      :open="asking !== null"
      title="Ask for this to be taught"
      description="It tells the department there is demand. It does not hold you a place, and it never expires on its own."
      @update:open="value => { if (!value) asking = null }"
    >
      <template #body>
        <UFormField
          label="Anything worth saying"
          hint="Optional"
          description="When you are free, why you need it, who else wants it."
        >
          <UTextarea
            v-model="note"
            :rows="3"
            :maxlength="REQUEST_NOTE_LIMIT"
            class="w-full"
            data-test="ask-note"
          />
        </UFormField>

        <div class="mt-4 flex flex-wrap gap-2">
          <UButton
            data-test="ask-submit"
            @click="asking && askFor(asking)"
          >
            Ask
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            @click="asking = null"
          >
            Back
          </UButton>
        </div>
      </template>
    </UModal>
  </UContainer>
</template>
