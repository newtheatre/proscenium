<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { formatLondon } from '#shared/utils/london'
import { ROLES } from '#shared/utils/roles'
import type { Role } from '#shared/utils/roles'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Accounts', middleware: 'console' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

interface Account {
  id: string
  name: string
  email: string
  verified: boolean
  disabled: boolean
  anonymisedAt: number | null
  lastLoginAt: number | null
  createdAt: number
  hasPassword: boolean
  hasGoogle: boolean
  hasFactor: boolean
}

interface Listing {
  items: Account[]
  page: number
  pageSize: number
  total: number
  pages: number
  awaiting: string | null
  banners: { privilegedWithoutFactor: number, insideRetentionWindow: number }
}

// The questions the directory is actually asked, in the order somebody asks them.
const FILTERS = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'role-holders', label: 'Role holders' },
  { value: 'privileged-without-mfa', label: 'Privileged, no authenticator' },
  { value: 'unverified', label: 'Unverified address' },
  { value: 'members-current', label: 'Current members' },
  { value: 'members-lapsed', label: 'Lapsed members' },
  { value: 'guests-unclaimed', label: 'Guests who never signed in' },
  { value: 'retention-window', label: 'Approaching retention' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'anonymised', label: 'Anonymised' },
]

const listing = ref<Listing | null>(null)
const filter = ref('everyone')
const role = ref<Role | undefined>(undefined)
const search = ref('')
const page = ref(1)
const loading = ref(false)
const failure = ref<string | null>(null)

const inviting = ref(false)
const invitation = reactive({ email: '', name: '', roles: [] as Role[] })
const invited = ref<string | null>(null)

async function load(): Promise<void> {
  loading.value = true
  failure.value = null
  try {
    listing.value = await $fetch<Listing>('/api/admin/accounts', {
      query: {
        filter: filter.value,
        role: filter.value === 'role-holders' ? role.value : undefined,
        search: search.value || undefined,
        page: page.value,
      },
    })
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    loading.value = false
  }
}

function show(next: string): void {
  filter.value = next
  page.value = 1
  void load()
}

// A new search starts at the first page: staying on page four of the old result is nonsense.
watch([search, role], () => {
  page.value = 1
  void load()
})
watch(page, load)

async function invite(): Promise<void> {
  failure.value = null
  try {
    await $fetch('/api/admin/accounts', { method: 'POST', body: { ...invitation } })
    invited.value = invitation.email
    inviting.value = false
    invitation.email = ''
    invitation.name = ''
    invitation.roles = []
    await load()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
}

const activeFilters = computed<ActiveFilter[]>(() => {
  const active: ActiveFilter[] = []
  if (search.value) {
    active.push({
      key: 'search',
      label: `Matching ${search.value}`,
      icon: 'i-lucide-search',
      clear: () => {
        search.value = ''
      },
    })
  }
  if (filter.value !== 'everyone') {
    active.push({
      key: 'filter',
      label: FILTERS.find(option => option.value === filter.value)!.label,
      icon: 'i-lucide-filter',
      clear: () => {
        show('everyone')
      },
    })
  }
  if (role.value) {
    active.push({
      key: 'role',
      label: role.value,
      icon: 'i-lucide-shield',
      clear: () => {
        role.value = undefined
      },
    })
  }
  return active
})

function clearFilters(): void {
  search.value = ''
  role.value = undefined
  show('everyone')
}

const seen = (at: number | null): string =>
  at ? formatLondon(new Date(at * 1000), { dateStyle: 'medium' }) : 'Never'

const columns: TableColumn<Account>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email', meta: { class: { td: 'font-mono text-sm' } } },
  {
    id: 'state',
    header: 'State',
    cell: ({ row }) => {
      const marks: { label: string, color: 'error' | 'warning' | 'neutral' | 'success' }[] = []
      if (row.original.anonymisedAt) marks.push({ label: 'Anonymised', color: 'neutral' })
      if (row.original.disabled) marks.push({ label: 'Disabled', color: 'error' })
      if (!row.original.verified) marks.push({ label: 'Unverified', color: 'warning' })
      if (row.original.hasFactor) marks.push({ label: 'Authenticator', color: 'success' })
      return h('div', { class: 'flex flex-wrap gap-1' }, marks.map(mark =>
        h(UBadge, { color: mark.color, variant: 'subtle', size: 'sm' }, () => mark.label)))
    },
  },
  {
    id: 'methods',
    header: 'Signs in with',
    cell: ({ row }) => [
      row.original.hasPassword ? 'password' : null,
      row.original.hasGoogle ? 'Google' : null,
    ].filter(Boolean).join(', ') || 'nothing yet',
  },
  { id: 'lastLoginAt', header: 'Last seen', cell: ({ row }) => seen(row.original.lastLoginAt) },
  {
    id: 'open',
    header: '',
    meta: { class: { td: 'text-right' } },
    cell: ({ row }) => h(UButton, {
      'to': `/people/accounts/${row.original.id}`,
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
      color="error"
      variant="subtle"
      :description="failure"
    />

    <div
      v-if="listing?.banners.privilegedWithoutFactor || listing?.banners.insideRetentionWindow"
      class="flex flex-col gap-2"
    >
      <UAlert
        v-if="listing.banners.privilegedWithoutFactor"
        data-test="banner-privileged"
        color="warning"
        variant="subtle"
        icon="i-lucide-shield-alert"
        :title="`${plural(listing.banners.privilegedWithoutFactor, 'privileged account')} without an authenticator`"
        description="Their roles do not work until they enrol one."
        :actions="[{ label: 'Show them', color: 'neutral', variant: 'subtle', onClick: () => show('privileged-without-mfa') }]"
      />
      <UAlert
        v-if="listing.banners.insideRetentionWindow"
        data-test="banner-retention"
        color="neutral"
        variant="subtle"
        icon="i-lucide-clock"
        :title="`${plural(listing.banners.insideRetentionWindow, 'account')} approaching retention`"
        description="Dormant for longer than the retention window allows."
        :actions="[{ label: 'Show them', color: 'neutral', variant: 'subtle', onClick: () => show('retention-window') }]"
      />
    </div>

    <AdminToolbar
      v-model:search="search"
      placeholder="A name, an address or a student number"
      :active="activeFilters"
      :loading="loading"
      @clear="clearFilters"
    >
      <template #filters>
        <UFormField label="Show">
          <USelect
            v-model="filter"
            data-test="directory-filter"
            :items="FILTERS"
            value-key="value"
            class="w-full"
            @update:model-value="show(filter)"
          />
        </UFormField>

        <UFormField
          v-if="filter === 'role-holders'"
          label="Role"
        >
          <USelect
            v-model="role"
            data-test="directory-role"
            :items="[{ label: 'Any role', value: undefined }, ...ROLES.map(name => ({ label: name, value: name }))]"
            value-key="value"
            class="w-full"
          />
        </UFormField>
      </template>

      <template #actions>
        <UButton
          data-test="invite"
          icon="i-lucide-user-plus"
          @click="inviting = true"
        >
          Add someone
        </UButton>
      </template>
    </AdminToolbar>

    <UAlert
      v-if="listing?.awaiting"
      data-test="directory-awaiting"
      color="neutral"
      variant="subtle"
      :description="`Nothing to show here yet: this needs ${listing.awaiting}, which is not built.`"
    />

    <UAlert
      v-if="invited"
      data-test="invited"
      color="success"
      variant="subtle"
      :description="`${invited} has an account and a link to choose a password.`"
      close
      @update:open="invited = null"
    />

    <UTable
      :data="listing?.items ?? []"
      :columns="columns"
      :loading="loading"
      data-test="directory-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ activeFilters.length ? 'Nobody matches that.' : 'No accounts yet.' }}
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="directory-total"
        class="text-sm text-muted"
      >
        {{ plural(listing?.total ?? 0, 'account') }}
      </p>
      <UPagination
        v-if="listing && listing.pages > 1"
        v-model:page="page"
        :total="listing.total"
        :items-per-page="listing.pageSize"
      />
    </div>

    <UModal
      v-model:open="inviting"
      title="Add someone"
      description="They get an account with no password and a link to choose one."
    >
      <template #body>
        <form
          class="space-y-4"
          @submit.prevent="invite"
        >
          <UFormField label="Name">
            <UInput
              v-model="invitation.name"
              data-test="invite-name"
              required
            />
          </UFormField>
          <UFormField
            label="Email address"
            description="A @newtheatre.org.uk address signs in with Google and gets no link."
          >
            <UInput
              v-model="invitation.email"
              data-test="invite-email"
              type="email"
              required
            />
          </UFormField>
          <UFormField
            label="Roles"
            description="Optional, and granted in the same action."
          >
            <USelectMenu
              v-model="invitation.roles"
              data-test="invite-roles"
              multiple
              :items="[...ROLES]"
            />
          </UFormField>
          <UButton
            type="submit"
            data-test="invite-submit"
          >
            Create the account
          </UButton>
        </form>
      </template>
    </UModal>
  </div>
</template>
