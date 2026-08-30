<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { recordMembership } from '#shared/utils/admin-forms'
import { MEMBERSHIP_TERMS, isInGrace, londonDay } from '#shared/utils/membership'
import type { RecordMembership } from '#shared/utils/admin-forms'
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'admin', title: 'Members', middleware: 'signed-in' })

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

const FILTERS = [
  { label: 'Current', value: 'current' },
  { label: 'Awaiting a check', value: 'awaiting-check' },
  { label: 'Lapsed', value: 'lapsed' },
  { label: 'Everyone ever', value: 'everyone' },
]

const listing = ref<Listing | null>(null)
const filter = ref('current')
const search = ref('')
const page = ref(1)
const loading = ref(false)
const failure = ref<string | null>(null)
const toast = useToast()
const grantForm = useTemplateRef('grantForm')

const granting = ref(false)
const grant = reactive<Partial<RecordMembership>>({ years: 1 })

async function load(): Promise<void> {
  loading.value = true
  failure.value = null
  try {
    listing.value = await $fetch<Listing>('/api/admin/memberships', {
      query: { filter: filter.value, search: search.value || undefined, page: page.value },
    })
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

const exportUrl = computed(() => {
  const query = new URLSearchParams({ filter: filter.value })
  if (search.value) query.set('search', search.value)
  return `/api/admin/memberships/export?${query.toString()}`
})

watch([filter, search], () => {
  page.value = 1
  void load()
})
watch(page, load)

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
    cell: ({ row }) => row.original.confirmedAt
      ? h(UBadge, { color: 'success', variant: 'subtle', size: 'sm' }, () => 'Yes')
      : h(UButton, {
          'variant': 'subtle',
          'size': 'sm',
          'data-test': 'confirm',
          'onClick': () => confirm(row.original),
        }, () => 'Confirm'),
  },
  {
    id: 'open',
    header: '',
    meta: { class: { td: 'text-right' } },
    cell: ({ row }) => h(UButton, {
      'to': `/admin/people/${row.original.userId}`,
      'variant': 'ghost',
      'size': 'sm',
      'icon': 'i-lucide-chevron-right',
      'aria-label': `Open ${row.original.name}`,
    }),
  },
]

onMounted(load)
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
      description="This records what somebody bought and when it runs out. A membership counts from the moment it is recorded: checking it against the SU's own list happens afterwards and never holds up a member price."
    />

    <div class="flex flex-wrap items-end gap-3">
      <UFormField
        label="Search"
        class="min-w-64 flex-1"
      >
        <UInput
          v-model="search"
          data-test="members-search"
          placeholder="A name, an address or a student number"
          icon="i-lucide-search"
        />
      </UFormField>

      <UFormField
        label="Show"
        class="min-w-48"
      >
        <USelect
          v-model="filter"
          data-test="members-filter"
          :items="FILTERS"
          value-key="value"
        />
      </UFormField>

      <UButton
        data-test="record-membership"
        icon="i-lucide-user-plus"
        @click="granting = true"
      >
        Record one
      </UButton>

      <UButton
        data-test="members-export"
        icon="i-lucide-download"
        variant="subtle"
        :to="exportUrl"
        external
      >
        Export
      </UButton>
    </div>

    <UTable
      :data="listing?.items ?? []"
      :columns="columns"
      :loading="loading"
      data-test="members-table"
    />

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="members-total"
        class="text-sm text-muted"
      >
        {{ listing?.total ?? 0 }} membership(s)
      </p>
      <UPagination
        v-if="listing && listing.pages > 1"
        v-model:page="page"
        :total="listing.total"
        :items-per-page="listing.pageSize"
      />
    </div>

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
