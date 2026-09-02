<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { EVIDENCE_REF_LIMIT, REVOKE_REASON_LIMIT, saysKind, saysSource } from '#shared/utils/training'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Training records', middleware: 'console' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

interface Record {
  id: string
  moduleId: string
  moduleName: string
  department: string
  kind: string
  awardedOn: string
  expiresOn: string | null
  source: string
  revokedAt: number | null
  superseded: boolean
  says: string
  held: boolean
}

interface Module {
  id: string
  name: string
  department: string
  kind: string
  status: string
  allowsExternal: boolean
  externalEvidence: string | null
}

const request = useRequestFetch()
const toast = useToast()
const person = ref<string | undefined>(undefined)
const search = ref('')
const failure = ref<string | null>(null)
const saving = ref(false)

const { data, status, refresh } = await useAsyncData(
  'admin-training-records',
  () => (person.value
    ? request<{ items: Record[] }>('/api/admin/training/records', { query: { userId: person.value } })
    : Promise.resolve({ items: [] as Record[] })),
  { watch: [person], default: (): { items: Record[] } => ({ items: [] }) },
)

const { data: catalogue } = await useAsyncData(
  'admin-training-records-modules',
  () => request<{ items: Module[] }>('/api/admin/training/modules'),
  { default: () => ({ items: [] as Module[] }) },
)

const shown = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return data.value.items
  return data.value.items.filter(record =>
    [record.moduleId, record.moduleName].some(field => field.toLowerCase().includes(term)))
})

// A brief is attended rather than signed off, and a retired module takes nothing new.
const signable = computed(() => catalogue.value.items.filter(module =>
  module.kind !== 'BRIEF' && module.status !== 'RETIRED'))

// Accepting outside evidence is the module's own choice, made in the catalogue (G-121 c1).
const external = computed(() => signable.value.filter(module => module.allowsExternal))

const signing = ref(false)
const chosen = ref<string | null>(null)
const revoking = ref<Record | null>(null)
const reason = ref('')

interface Certificate {
  moduleId: string
  awardedOn: string | undefined
  expiresOn: string | undefined
  evidenceRef: string
}

const blank = (): Certificate =>
  ({ moduleId: '', awardedOn: todayInLondon(), expiresOn: undefined, evidenceRef: '' })

const recording = ref(false)
const certificate = reactive<Certificate>(blank())

// What the module asks to see, so the recorder knows which paper counts before they type it.
const wanted = computed(() =>
  external.value.find(module => module.id === certificate.moduleId)?.externalEvidence ?? null)

const recordable = computed(() =>
  Boolean(certificate.moduleId && certificate.awardedOn && certificate.expiresOn && certificate.evidenceRef.trim()))

async function recordCertificate(): Promise<void> {
  if (!person.value || !recordable.value) return
  saving.value = true
  failure.value = null
  try {
    await $fetch('/api/admin/training/external-certificates', {
      method: 'POST',
      body: { userId: person.value, ...certificate, evidenceRef: certificate.evidenceRef.trim() },
    })
    toast.add({ title: 'Recorded', icon: 'i-lucide-award', color: 'success' })
    recording.value = false
    Object.assign(certificate, blank())
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    saving.value = false
  }
}

async function signOff(): Promise<void> {
  if (!person.value || !chosen.value) return
  saving.value = true
  failure.value = null
  try {
    await $fetch('/api/admin/training/signoffs', {
      method: 'POST',
      body: { userId: person.value, moduleId: chosen.value, awardedOn: todayInLondon() },
    })
    toast.add({ title: 'Signed off', icon: 'i-lucide-check', color: 'success' })
    signing.value = false
    chosen.value = null
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    saving.value = false
  }
}

async function revoke(): Promise<void> {
  const record = revoking.value
  if (!record) return
  saving.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/training/records/${record.id}/revoke`, {
      method: 'POST',
      body: { reason: reason.value },
    })
    toast.add({
      title: 'Revoked',
      description: 'The record stays on the history and stops counting at every gate.',
      icon: 'i-lucide-ban',
    })
    revoking.value = null
    reason.value = ''
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    saving.value = false
  }
}

// The award is dated today, in London, which is the day the gate reads (0014).
function todayInLondon(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())
}

const activeFilters = computed<ActiveFilter[]>(() => {
  const active: ActiveFilter[] = []
  if (search.value) {
    active.push({ key: 'search', label: `Matching ${search.value}`, icon: 'i-lucide-search', clear: () => {
      search.value = ''
    } })
  }
  return active
})

const columns: TableColumn<Record>[] = [
  {
    id: 'module',
    header: 'Module',
    cell: ({ row }) => h('div', {}, [
      h('div', { class: 'flex flex-wrap items-center gap-2' }, [
        h('span', { class: 'font-mono text-sm text-muted' }, row.original.moduleId),
        h('span', {}, row.original.moduleName),
      ]),
      h('div', { class: 'text-xs text-muted' },
        `${row.original.department} · ${saysKind(row.original.kind)} · ${saysSource(row.original.source)}`),
    ]),
  },
  {
    id: 'when',
    header: 'Held',
    meta: { class: { td: 'text-sm whitespace-nowrap' } },
    cell: ({ row }) => h('div', {}, [
      h('div', {}, `Awarded ${row.original.awardedOn}`),
      h('div', { class: 'text-xs text-muted' },
        row.original.expiresOn ? `Runs to ${row.original.expiresOn}` : 'Never expires'),
    ]),
  },
  {
    id: 'state',
    header: 'State',
    cell: ({ row }) => h('div', { class: 'flex flex-wrap gap-1' }, [
      row.original.revokedAt
        ? h(UBadge, { color: 'error', variant: 'subtle', size: 'sm' }, () => 'Revoked')
        : h(UBadge, {
            color: row.original.held ? 'success' : 'neutral',
            variant: 'subtle',
            size: 'sm',
          }, () => row.original.says),
      row.original.superseded
        ? h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => 'Superseded')
        : null,
    ]),
  },
  {
    id: 'act',
    header: '',
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => (row.original.revokedAt
      ? null
      : h(UButton, {
          'size': 'sm',
          'color': 'error',
          'variant': 'ghost',
          'data-test': `revoke-${row.original.id}`,
          'onClick': () => {
            revoking.value = row.original
            reason.value = ''
          },
        }, () => 'Revoke')),
  },
]
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
      icon="i-lucide-clipboard-check"
      title="What somebody holds, and how they came to hold it"
      description="A sign-off records competence proven outside a session, and an external certificate records competence earned elsewhere that we never assessed. Nothing is ever deleted: a correction is a revocation with a reason, and then a fresh award."
    />

    <UFormField
      label="Whose records"
      description="Their whole history, including what has been revoked or superseded."
    >
      <PersonPicker
        v-model="person"
        class="w-full sm:w-96"
      />
    </UFormField>

    <template v-if="person">
      <AdminToolbar
        v-model:search="search"
        placeholder="A module id or its title"
        :active="activeFilters"
        :loading="status === 'pending'"
        @clear="search = ''"
      >
        <template #actions>
          <UButton
            data-test="sign-off"
            icon="i-lucide-plus"
            :disabled="signable.length === 0"
            @click="signing = true"
          >
            Sign something off
          </UButton>
          <UButton
            data-test="record-external"
            icon="i-lucide-award"
            color="neutral"
            variant="outline"
            :disabled="external.length === 0"
            @click="recording = true"
          >
            Record a certificate
          </UButton>
        </template>
      </AdminToolbar>

      <UTable
        :data="shown"
        :columns="columns"
        :loading="status === 'pending'"
        data-test="records-table"
      >
        <template #empty>
          <p class="py-6 text-center text-sm text-muted">
            They hold no training records yet.
          </p>
        </template>
      </UTable>

      <p
        data-test="records-total"
        class="text-sm text-muted"
      >
        {{ plural(shown.length, 'record') }}
      </p>
    </template>

    <UModal
      v-model:open="signing"
      title="Sign a module off"
      description="Dated today. Every direct prerequisite has to be held already, and the refusal names any that are not."
    >
      <template #body>
        <div class="flex flex-wrap gap-1">
          <UButton
            v-for="module in signable"
            :key="module.id"
            size="sm"
            :color="chosen === module.id ? 'primary' : 'neutral'"
            :variant="chosen === module.id ? 'solid' : 'outline'"
            :aria-pressed="chosen === module.id"
            :data-test="`sign-${module.id}`"
            @click="chosen = module.id"
          >
            {{ module.id }}
          </UButton>
        </div>
      </template>

      <template #footer>
        <UButton
          :loading="saving"
          :disabled="!chosen"
          data-test="sign-off-submit"
          @click="signOff"
        >
          Sign it off
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="signing = false"
        >
          Back
        </UButton>
      </template>
    </UModal>

    <UModal
      v-model:open="recording"
      title="Record an external certificate"
      description="Competence earned elsewhere. We record it rather than assess it, so the paper and its dates are the evidence."
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            label="Which module"
            description="Only modules whose department has said they accept outside evidence."
          >
            <div class="flex flex-wrap gap-1">
              <UButton
                v-for="module in external"
                :key="module.id"
                size="sm"
                :color="certificate.moduleId === module.id ? 'primary' : 'neutral'"
                :variant="certificate.moduleId === module.id ? 'solid' : 'outline'"
                :aria-pressed="certificate.moduleId === module.id"
                :data-test="`external-${module.id}`"
                @click="certificate.moduleId = module.id"
              >
                {{ module.id }}
              </UButton>
            </div>
          </UFormField>

          <UFormField
            label="Awarded on"
            required
            description="The day the issuing body granted it, which cannot be in the future."
          >
            <DateField
              v-model="certificate.awardedOn"
              data-test="external-awarded"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Runs to"
            required
            description="The issuing body's own expiry date. A certificate never takes the module's policy, and nothing here may run more than ten years from the award."
          >
            <DateField
              v-model="certificate.expiresOn"
              data-test="external-expiry"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Evidence"
            required
            :description="wanted ?? `A certificate number, the issuing body, or a document reference. Up to ${EVIDENCE_REF_LIMIT} characters.`"
          >
            <UInput
              v-model="certificate.evidenceRef"
              class="w-full"
              :maxlength="EVIDENCE_REF_LIMIT"
              data-test="external-evidence"
            />
          </UFormField>
        </div>
      </template>

      <template #footer>
        <UButton
          :loading="saving"
          :disabled="!recordable"
          data-test="external-submit"
          @click="recordCertificate"
        >
          Record it
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="recording = false"
        >
          Back
        </UButton>
      </template>
    </UModal>

    <UModal
      :open="revoking !== null"
      :title="revoking ? `Revoke ${revoking.moduleId}` : ''"
      description="The record stays and stops counting. A reason is required, and it is scrubbed if the person is ever erased."
      @update:open="revoking = null"
    >
      <template #body>
        <UFormField
          label="Why"
          required
          :description="`Up to ${REVOKE_REASON_LIMIT} characters. Never shown on the audit trail.`"
        >
          <UTextarea
            v-model="reason"
            :rows="3"
            :maxlength="REVOKE_REASON_LIMIT"
            class="w-full"
            data-test="revoke-reason"
          />
        </UFormField>
      </template>

      <template #footer>
        <UButton
          color="error"
          :loading="saving"
          :disabled="!reason.trim()"
          data-test="revoke-submit"
          @click="revoke"
        >
          Revoke it
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="revoking = null"
        >
          Back
        </UButton>
      </template>
    </UModal>
  </div>
</template>
