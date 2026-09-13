<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { can, manageMembers } from '#shared/utils/abilities'
import { recordMembership } from '#shared/utils/admin-forms'
import { formatLondon } from '#shared/utils/london'
import { MEMBERSHIP_TERMS, isInGrace, londonDay } from '#shared/utils/membership'
import { claimDeclineForm } from '#shared/utils/membership-claims'
import { membershipsList } from '#shared/utils/memberships-list'
import type { RecordMembership } from '#shared/utils/admin-forms'
import type { ClaimDeclineInput } from '#shared/utils/membership-claims'
import type { FilterOption } from '#shared/utils/list-filters'
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Members', middleware: 'console' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

interface Member {
  id: string
  userId: string
  name: string
  email: string
  studentId: string | null
  startsOn: string
  expiresOn: string
  source: string
  confirmedAt: number | null
}

interface Listing {
  items: Member[]
  page: number
  pageSize: number
  total: number
  pages: number
  graceDays: number
}

interface Claim {
  id: string
  userId: string
  name: string
  email: string
  studentId: string
  heldStudentId: string | null
  startsOn: string
  term: number
  status: string
  createdAt: number
  heldUntil: string | null
}

interface ClaimListing {
  items: Claim[]
  page: number
  pageSize: number
  total: number
  pages: number
}

// The claims queue is a different table under the same screen: what members said they bought,
// waiting for an officer to write it down (A-130).
const AWAITING_RECORD = 'awaiting-record'

// Search, the register filter, sort and page live in the URL (K-129). A bare `?filter=` link
// keeps working, so the runbook's bookmark to the queue is unaffected.
const { search, conditions, sort, page, query, active, set, setSort, clear } = useListQuery(membershipsList)

const listing = ref<Listing | null>(null)
const claims = ref<ClaimListing | null>(null)
// How many are waiting, shown on the filter so the queue is visible from every other view.
const waiting = ref<number | null>(null)
const loading = ref(false)
const failure = ref<string | null>(null)
const toast = useToast()
const writes = computed(() => can(useViewer().value, manageMembers))
const grantForm = useTemplateRef('grantForm')

const granting = ref(false)
const grant = reactive<Partial<RecordMembership>>({ years: 1 })

const declining = ref<Claim | null>(null)
const decline = reactive<Partial<ClaimDeclineInput>>({ reason: '' })
const deciding = ref<string | null>(null)

// No condition means the default view, current, the same hidden default the endpoint applies.
const filter = computed(() => conditions.value.find(one => one.key === 'filter')?.values[0] ?? 'current')
const onQueue = computed(() => filter.value === AWAITING_RECORD)

// The live count rides on the option's label, the runtime-known slot ConsoleFilters offers (0032).
const filterOptions = computed<FilterOption[]>(() => membershipsList.fields[0]!.options.map(option =>
  option.value === AWAITING_RECORD && waiting.value !== null ? { ...option, label: `${option.label} (${waiting.value})` } : option))

async function countWaiting(): Promise<void> {
  try {
    const answer = await $fetch<ClaimListing>('/api/admin/memberships/claims', { query: { pageSize: 1 } })
    waiting.value = answer.total
  }
  catch {
    waiting.value = null
  }
}

async function load(): Promise<void> {
  loading.value = true
  failure.value = null
  try {
    if (onQueue.value) {
      claims.value = await $fetch<ClaimListing>('/api/admin/memberships/claims', {
        query: { search: search.value || undefined, page: page.value },
      })
      if (!search.value) waiting.value = claims.value.total
      else void countWaiting()
    }
    else {
      listing.value = await $fetch<Listing>('/api/admin/memberships', { query: query.value })
    }
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    loading.value = false
  }
}

async function record(event: FormSubmitEvent<RecordMembership>): Promise<void> {
  failure.value = null
  try {
    await $fetch('/api/admin/memberships', { method: 'POST', body: event.data })
    toast.add({
      title: 'Membership recorded',
      description: 'It counts from now, whether or not anybody has checked it yet.',
      icon: 'i-lucide-badge-check',
      color: 'success',
    })
    granting.value = false
    grant.userId = undefined
    grant.evidence = undefined
    grant.studentId = undefined
    await load()
  }
  catch (error) {
    // A clashing student number is about that field; anything else is about the person.
    const message = refusalText(error)
    if (/student number/i.test(message)) grantForm.value?.setErrors([{ name: 'studentId', message }])
    else if (/account/i.test(message)) grantForm.value?.setErrors([{ name: 'userId', message }])
    else failure.value = message
  }
}

async function confirm(member: Member): Promise<void> {
  failure.value = null
  try {
    await $fetch(`/api/admin/memberships/${member.id}/confirm`, { method: 'POST' })
    toast.add({ title: `${member.name} checked against the SU's list`, icon: 'i-lucide-check', color: 'success' })
    await load()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
}

// Focus moves to the next claim's button, so a queue of hundreds is worked from the keyboard.
async function focusNextClaim(): Promise<void> {
  await nextTick()
  const next = document.querySelector<HTMLElement>('[data-test^="claim-record-"]')
  next?.focus()
}

async function recordClaim(claim: Claim): Promise<void> {
  failure.value = null
  deciding.value = claim.id
  try {
    await $fetch(`/api/admin/memberships/claims/${claim.id}/record`, { method: 'POST' })
    toast.add({ title: `${claim.name} recorded`, icon: 'i-lucide-badge-check', color: 'success' })
    await Promise.all([load(), countWaiting()])
    await focusNextClaim()
  }
  catch (error) {
    failure.value = refusalText(error)
    await load()
  }
  finally {
    deciding.value = null
  }
}

function askWhy(claim: Claim): void {
  decline.reason = ''
  declining.value = claim
}

async function declineClaim(event: FormSubmitEvent<ClaimDeclineInput>): Promise<void> {
  const claim = declining.value
  if (!claim) return
  failure.value = null
  deciding.value = claim.id
  try {
    await $fetch(`/api/admin/memberships/claims/${claim.id}/decline`, { method: 'POST', body: event.data })
    toast.add({ title: `${claim.name} told why`, icon: 'i-lucide-message-square-warning', color: 'neutral' })
    declining.value = null
    await Promise.all([load(), countWaiting()])
    await focusNextClaim()
  }
  catch (error) {
    failure.value = refusalText(error)
    declining.value = null
    await load()
  }
  finally {
    deciding.value = null
  }
}

const exportUrl = computed(() => {
  const params = new URLSearchParams({ filter: filter.value })
  if (search.value) params.set('search', search.value)
  return `/api/admin/memberships/export?${params.toString()}`
})

watch(query, load)

const columns: TableColumn<Member>[] = [
  {
    id: 'name',
    header: 'Member',
    cell: ({ row }) => h('div', {}, [
      h('div', {}, row.original.name),
      h('div', { class: 'font-mono text-xs text-muted' }, row.original.studentId ?? row.original.email),
    ]),
  },
  { accessorKey: 'startsOn', header: 'From', meta: { class: { td: 'font-mono text-sm whitespace-nowrap' } } },
  {
    id: 'expiresOn',
    header: 'Until',
    cell: ({ row }) => h('div', { class: 'flex items-center gap-2 whitespace-nowrap' }, [
      h('span', { class: 'font-mono text-sm' }, row.original.expiresOn),
      isInGrace(row.original, londonDay(new Date()), listing.value?.graceDays ?? 0)
        ? h(UBadge, { color: 'warning', variant: 'subtle', size: 'sm' }, () => 'In grace')
        : null,
    ]),
  },
  { accessorKey: 'source', header: 'Source', meta: { class: { td: 'text-sm text-muted' } } },
  {
    id: 'confirmed',
    header: 'Checked',
    cell: ({ row }) => {
      if (row.original.confirmedAt) return h(UBadge, { color: 'success', variant: 'subtle', size: 'sm' }, () => 'Yes')
      if (!writes.value) return h('span', { class: 'text-sm text-muted' }, 'No')
      return h(UButton, {
        'variant': 'subtle',
        'size': 'sm',
        'data-test': 'confirm',
        'onClick': () => confirm(row.original),
      }, () => 'Confirm')
    },
  },
  {
    id: 'open',
    header: '',
    meta: { class: { td: 'text-right' } },
    cell: ({ row }) => h(UButton, {
      'to': `/people/accounts/${row.original.userId}`,
      'variant': 'ghost',
      'size': 'sm',
      'icon': 'i-lucide-chevron-right',
      'aria-label': `Open ${row.original.name}`,
    }),
  },
]

const sayWhen = (at: number): string => formatLondon(new Date(at * 1000), { day: 'numeric', month: 'short' })

const claimColumns: TableColumn<Claim>[] = [
  {
    id: 'name',
    header: 'Member',
    cell: ({ row }) => h('div', {}, [
      h('div', {}, row.original.name),
      h('div', { class: 'text-xs text-muted' }, row.original.email),
    ]),
  },
  {
    id: 'studentId',
    header: 'Student number',
    cell: ({ row }) => h('div', { class: 'flex items-center gap-2 whitespace-nowrap' }, [
      h('span', { class: 'font-mono text-sm' }, row.original.studentId),
      row.original.heldStudentId && row.original.heldStudentId !== row.original.studentId
        ? h(UBadge, { color: 'warning', variant: 'subtle', size: 'sm', title: `The account holds ${row.original.heldStudentId}` }, () => 'Differs')
        : null,
    ]),
  },
  { accessorKey: 'startsOn', header: 'Bought', meta: { class: { td: 'font-mono text-sm whitespace-nowrap' } } },
  {
    id: 'term',
    header: 'Term',
    cell: ({ row }) => `${row.original.term} year${row.original.term === 1 ? '' : 's'}`,
    meta: { class: { td: 'text-sm whitespace-nowrap' } },
  },
  {
    id: 'since',
    header: 'Waiting since',
    cell: ({ row }) => h('div', { class: 'flex items-center gap-2 whitespace-nowrap' }, [
      h('span', {}, sayWhen(row.original.createdAt)),
      row.original.heldUntil && row.original.heldUntil >= londonDay(new Date())
        ? h(UBadge, { 'color': 'info', 'variant': 'subtle', 'size': 'sm', 'data-test': 'claim-held' }, () => `Holds one until ${row.original.heldUntil}`)
        : null,
    ]),
    meta: { class: { td: 'text-sm text-muted' } },
  },
  {
    id: 'decide',
    header: '',
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => (writes.value === false
      ? null
      : h('div', { class: 'flex justify-end gap-2' }, [
          h(UButton, {
            'size': 'sm',
            'icon': 'i-lucide-check',
            'data-test': `claim-record-${row.original.id}`,
            'loading': deciding.value === row.original.id,
            'onClick': () => recordClaim(row.original),
          }, () => 'Record'),
          h(UButton, {
            'size': 'sm',
            'color': 'neutral',
            'variant': 'outline',
            'data-test': `claim-decline-${row.original.id}`,
            'disabled': deciding.value === row.original.id,
            'onClick': () => askWhy(row.original),
          }, () => 'Decline'),
        ])),
  },
]

onMounted(() => {
  void load()
  void countWaiting()
})
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
      icon="i-lucide-badge-check"
      title="Membership is bought at the Students' Union"
      description="This records what somebody bought and when it runs out. A membership counts from the moment it is recorded: checking it against the SU's own list happens afterwards and never holds up a member price. Current counts the grace window after a term ends; awaiting record is what members have claimed and nobody has written down yet."
    />

    <AdminToolbar
      v-model:search="search"
      :placeholder="membershipsList.search?.placeholder"
      :active="active"
      :loading="loading"
      @clear="clear"
    >
      <template #filters>
        <ConsoleFilters
          :spec="membershipsList"
          :conditions="conditions"
          :sort="sort"
          :options="{ filter: filterOptions }"
          @set="set"
          @sort="setSort"
        />
      </template>

      <template #actions>
        <UButton
          v-if="writes"
          data-test="record-membership"
          icon="i-lucide-user-plus"
          @click="granting = true"
        >
          Record one
        </UButton>

        <UButton
          v-if="!onQueue"
          data-test="members-export"
          icon="i-lucide-download"
          color="neutral"
          variant="outline"
          :to="exportUrl"
          external
        >
          Export
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      v-if="onQueue"
      :data="claims?.items ?? []"
      :columns="claimColumns"
      :loading="loading"
      data-test="claims-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ search ? 'No claim matches that.' : 'Nothing waiting to be recorded.' }}
        </p>
      </template>
    </UTable>

    <UTable
      v-else
      :data="listing?.items ?? []"
      :columns="columns"
      :loading="loading"
      data-test="members-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ search || filter !== 'current'
            ? 'No membership matches that.'
            : 'No current memberships. One appears here as soon as it is recorded.' }}
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="members-total"
        class="text-sm text-muted"
      >
        {{ onQueue ? plural(claims?.total ?? 0, 'claim') : plural(listing?.total ?? 0, 'membership') }}
      </p>
      <UPagination
        v-if="onQueue ? claims && claims.pages > 1 : listing && listing.pages > 1"
        v-model:page="page"
        :total="onQueue ? claims?.total ?? 0 : listing?.total ?? 0"
        :items-per-page="onQueue ? claims?.pageSize ?? 25 : listing?.pageSize ?? 25"
      />
    </div>

    <UModal
      :open="declining !== null"
      title="Decline this claim"
      description="The member reads what you write here, so say what to put right."
      @update:open="value => { if (!value) declining = null }"
    >
      <template #body>
        <UForm
          :schema="claimDeclineForm"
          :state="decline"
          class="space-y-4"
          @submit="declineClaim"
        >
          <p
            v-if="declining"
            class="text-sm text-muted"
          >
            {{ declining.name }}, student number {{ declining.studentId }}, bought on {{ declining.startsOn }}.
          </p>
          <UFormField
            name="reason"
            label="Why"
            required
          >
            <UTextarea
              v-model="decline.reason"
              data-test="claim-decline-reason"
              :rows="3"
              autofocus
              class="w-full"
            />
          </UFormField>
          <UButton
            type="submit"
            data-test="claim-decline-submit"
            color="neutral"
            :loading="deciding !== null"
          >
            Decline and tell them
          </UButton>
        </UForm>
      </template>
    </UModal>

    <UModal
      v-model:open="granting"
      title="Record a membership"
      description="What they bought at the SU, and when."
    >
      <template #body>
        <UForm
          ref="grantForm"
          :schema="recordMembership"
          :state="grant"
          class="space-y-4"
          @submit="record"
        >
          <UFormField
            name="userId"
            label="Who bought it"
            required
          >
            <PersonPicker
              v-model="grant.userId"
              class="w-full"
            />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              name="startsOn"
              label="Bought on"
              description="The term runs from this day."
              required
            >
              <DateField
                v-model="grant.startsOn"
                data-test="grant-starts"
                class="w-full"
              />
            </UFormField>
            <UFormField
              name="years"
              label="Term"
              required
            >
              <USelect
                v-model="grant.years"
                data-test="grant-years"
                :items="MEMBERSHIP_TERMS.map(years => ({ label: `${years} year${years === 1 ? '' : 's'}`, value: years }))"
                value-key="value"
                class="w-full"
              />
            </UFormField>
          </div>
          <UFormField
            name="studentId"
            label="Student number"
            description="How the committee finds them on the SU's list. Stored on the account."
            hint="Optional"
          >
            <UInput
              v-model="grant.studentId"
              data-test="grant-student-id"
              class="w-full"
            />
          </UFormField>
          <UFormField
            name="evidence"
            label="Evidence"
            description="The SU's own reference for the purchase."
            hint="Optional"
          >
            <UInput
              v-model="grant.evidence"
              data-test="grant-evidence"
              class="w-full"
            />
          </UFormField>
          <UButton
            type="submit"
            data-test="grant-submit"
          >
            Record it
          </UButton>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
