<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { accountsList } from '#shared/utils/accounts-list'
import { formatLondon } from '#shared/utils/london'
import { ROLES } from '#shared/utils/roles'
import type { FieldKey } from '#shared/utils/list-filters'
import type { Role } from '#shared/utils/roles'
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
  banners: { privilegedWithoutFactor: number, insideRetentionWindow: number }
}

const request = useRequestFetch()
const toast = useToast()

// Search, filters, sort and page live in the URL, so a triage list can be linked to (K-129).
const { search, conditions, sort, page, query, active, filtered, set, setSort, clear } = useListQuery(accountsList)

const empty = (): Listing => ({ items: [], page: 1, pageSize: 0, total: 0, pages: 1, banners: { privilegedWithoutFactor: 0, insideRetentionWindow: 0 } })

const { data: listing, status, error, refresh } = await useAsyncData(
  'people-accounts',
  () => request<Listing>('/api/admin/accounts', { query: query.value }),
  { watch: [query], default: empty },
)

const failure = ref<string | null>(null)
const listingFailure = useListFailure(error, 'The accounts could not be read.')

// A banner's "show them" is the same question as the filter it names, asked through the URL.
const show = (key: FieldKey<typeof accountsList>): void => set(key, { key, operator: 'is', values: ['true'] })

const inviting = ref(false)
const invitation = reactive({ email: '', name: '', roles: [] as Role[] })

async function invite(): Promise<void> {
  failure.value = null
  try {
    await $fetch('/api/admin/accounts', { method: 'POST', body: { ...invitation } })
    toast.add({ title: 'Account created', description: `${invitation.email} has a link to choose a password.`, icon: 'i-lucide-check', color: 'success' })
    inviting.value = false
    invitation.email = ''
    invitation.name = ''
    invitation.roles = []
    await refresh()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
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
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="listingFailure"
      data-test="listing-failure"
      color="error"
      variant="subtle"
      :description="listingFailure.message"
      :actions="listingFailure.enrolPath ? [{ label: 'Set up an authenticator app', to: listingFailure.enrolPath, color: 'error' }] : []"
    />

    <div
      v-if="listing.banners.privilegedWithoutFactor || listing.banners.insideRetentionWindow"
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
        :actions="[{ label: 'Show them', color: 'neutral', variant: 'subtle', onClick: () => show('privilegedWithoutFactor') }]"
      />
      <UAlert
        v-if="listing.banners.insideRetentionWindow"
        data-test="banner-retention"
        color="neutral"
        variant="subtle"
        icon="i-lucide-clock"
        :title="`${plural(listing.banners.insideRetentionWindow, 'account')} approaching retention`"
        description="Dormant for longer than the retention window allows."
        :actions="[{ label: 'Show them', color: 'neutral', variant: 'subtle', onClick: () => show('approachingRetention') }]"
      />
    </div>

    <AdminToolbar
      v-model:search="search"
      :placeholder="accountsList.search?.placeholder"
      :active="active"
      :loading="status === 'pending'"
      @clear="clear"
    >
      <template #filters>
        <ConsoleFilters
          :spec="accountsList"
          :conditions="conditions"
          :sort="sort"
          @set="set"
          @sort="setSort"
        />
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

    <UTable
      :data="listing.items"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="directory-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ listingFailure ? listingFailure.message : filtered ? 'Nobody matches that.' : 'No accounts yet.' }}
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="directory-total"
        class="text-sm text-muted"
      >
        {{ plural(listing.total, 'account') }}
      </p>
      <UPagination
        v-if="listing.pages > 1"
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
          <UAlert
            v-if="failure"
            data-test="form-failure"
            color="error"
            variant="subtle"
            :description="failure"
          />
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
