<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { can, grantRoles, revokeRoles } from '#shared/utils/abilities'
import { saysDay } from '#shared/utils/when'
import { ROLES, saysRole } from '#shared/utils/roles'
import { rolesList } from '#shared/utils/roles-list'
import type { Role } from '#shared/utils/roles'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Roles', middleware: 'console', docs: '/docs/people/roles' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

interface Holder {
  id: string
  userId: string
  name: string
  email: string
  role: string
  expiresAt: number | null
  grantedAt: number
  grantedBy: string | null
  note: string | null
  live: boolean
  disabled: boolean
}

interface Register {
  items: Holder[]
  page: number
  pageSize: number
  total: number
  pages: number
  counts: Record<string, number>
  permanent: Holder[]
  // Granted by address and waiting on a first sign-in: never counted as holders (A-132, 0088).
  pending: Holder[]
  // Lapsed grants the default listing left out; 0 whenever they were not hidden.
  lapsedHidden: number
}

const request = useRequestFetch()
const toast = useToast()

// The chosen role lives in the URL like every other filter, so a register can be linked (K-129).
const { search, conditions, sort, page, query, active, filtered, set, setSort, clear } = useListQuery(rolesList)

const empty = (): Register => ({ items: [], page: 1, pageSize: 0, total: 0, pages: 1, counts: {}, permanent: [], pending: [], lapsedHidden: 0 })

const { data: register, status, error, refresh } = await useAsyncData(
  'people-roles',
  () => request<Register>('/api/admin/roles/register', { query: query.value }),
  { watch: [query], default: empty },
)

const listingFailure = useListFailure(error, 'The role register could not be read.')
const working = ref('')

const sees = computed(() => ({
  grants: can(useViewer().value, grantRoles),
  revokes: can(useViewer().value, revokeRoles),
}))

// One role at a time is what the tiles ask; a hand-written "any of" in the URL still reads, and
// simply leaves no tile looking chosen.
const chosen = computed<Role | null>(() => {
  const condition = conditions.value.find(entry => entry.key === 'role')
  if (!condition || condition.operator !== 'is') return null
  return (condition.values[0] ?? null) as Role | null
})

const tiles = computed(() => ROLES.map(role => ({
  role,
  label: saysRole(role),
  holders: register.value.counts[role] ?? 0,
})))

function choose(role: Role): void {
  set('role', chosen.value === role ? null : { key: 'role', operator: 'is', values: [role] })
}

const revoking = ref<Holder | null>(null)
const revokeFailure = ref<string | null>(null)

function askRevoke(holder: Holder): void {
  revokeFailure.value = null
  revoking.value = holder
}

async function revoke(): Promise<void> {
  const holder = revoking.value
  if (!holder) return
  working.value = `${holder.userId}-${holder.role}`
  revokeFailure.value = null
  try {
    // Query, not body: a DELETE carrying a body hangs the Workers runtime when read (0068).
    await $fetch('/api/admin/roles', { method: 'DELETE', query: { userId: holder.userId, role: holder.role } })
    toast.add({ title: 'Role revoked', description: `${holder.name} no longer holds ${saysRole(holder.role)}.`, icon: 'i-lucide-check', color: 'success' })
    revoking.value = null
    await refresh()
  }
  catch (refused) {
    revokeFailure.value = refusalText(refused)
  }
  finally {
    working.value = ''
  }
}

async function granted(): Promise<void> {
  toast.add({ title: 'Role granted', description: 'The register is up to date.', icon: 'i-lucide-check', color: 'success' })
  await refresh()
}

const when = (at: number | null): string =>
  at === null ? 'further notice' : saysDay(at)

// Hidden lapsed grants are counted on the total line, so hidden never means lost (0071).
const totalLine = computed(() => register.value.lapsedHidden
  ? `${plural(register.value.total, 'grant')}, ${plural(register.value.lapsedHidden, 'lapsed grant')} hidden`
  : plural(register.value.total, 'grant'))

const columns: TableColumn<Holder>[] = [
  {
    id: 'holder',
    header: 'Holder',
    cell: ({ row }) => h('div', {}, [
      h('div', {}, row.original.name),
      h('div', { class: 'font-mono text-xs text-muted' }, row.original.email),
      // Below sm the end date and the grant's provenance are hidden: shown here instead, so a
      // phone keeps the role, the state and the row actions in view (issue 922).
      h('div', { class: 'sm:hidden text-xs text-muted' }, [
        `Until ${when(row.original.expiresAt)}`,
        `granted ${when(row.original.grantedAt)}${row.original.grantedBy ? ` by ${row.original.grantedBy}` : ''}`,
        row.original.note,
      ].filter(Boolean).join(' · ')),
    ]),
  },
  { id: 'role', header: 'Role', cell: ({ row }) => saysRole(row.original.role) },
  {
    id: 'state',
    header: 'State',
    cell: ({ row }) => {
      const marks: { label: string, color: 'error' | 'warning' | 'neutral' }[] = []
      if (!row.original.live) marks.push({ label: 'Lapsed', color: 'warning' })
      if (row.original.disabled) marks.push({ label: 'Disabled', color: 'error' })
      if (row.original.expiresAt === null) marks.push({ label: 'Permanent', color: 'neutral' })
      return h('div', { class: 'flex flex-wrap gap-1' }, marks.map(mark =>
        h(UBadge, { color: mark.color, variant: 'subtle', size: 'sm' }, () => mark.label)))
    },
  },
  {
    id: 'expiresAt',
    header: 'Until',
    meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} whitespace-nowrap` } },
    cell: ({ row }) => when(row.original.expiresAt),
  },
  {
    id: 'provenance',
    header: 'Granted',
    meta: { class: { th: HIDE_BELOW_SM, td: HIDE_BELOW_SM } },
    cell: ({ row }) => h('div', {}, [
      h('div', {}, `${when(row.original.grantedAt)}${row.original.grantedBy ? ` by ${row.original.grantedBy}` : ''}`),
      row.original.note ? h('div', { class: 'text-xs text-muted' }, row.original.note) : null,
    ]),
  },
  {
    id: 'act',
    header: ACTIONS_HEADER,
    meta: { class: { td: 'text-right' } },
    cell: ({ row }) => h('div', { class: 'flex justify-end gap-1' }, [
      h(UButton, {
        'to': `/people/accounts/${row.original.userId}`,
        'variant': 'ghost',
        'size': 'sm',
        'icon': 'i-lucide-chevron-right',
        'aria-label': `Open ${row.original.name}`,
      }),
      sees.value.revokes
        ? h(UButton, {
            'size': 'xs',
            'color': 'error',
            'variant': 'ghost',
            'label': 'Revoke',
            'loading': working.value === `${row.original.userId}-${row.original.role}`,
            'data-test': `revoke-${row.original.userId}-${row.original.role}`,
            'onClick': () => askRevoke(row.original),
          })
        : null,
    ]),
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

    <p class="text-sm text-muted">
      Pick a role to see who holds it now.
    </p>

    <div
      data-test="role-tiles"
      class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
    >
      <UButton
        v-for="tile in tiles"
        :key="tile.role"
        :color="chosen === tile.role ? 'primary' : 'neutral'"
        :variant="chosen === tile.role ? 'subtle' : 'outline'"
        class="justify-between"
        :data-test="`tile-${tile.role}`"
        @click="choose(tile.role)"
      >
        <span>{{ tile.label }}</span>
        <UBadge
          color="neutral"
          variant="subtle"
          size="sm"
        >
          {{ plural(tile.holders, 'holder') }}
        </UBadge>
      </UButton>
    </div>

    <UPageCard
      v-if="chosen && sees.grants"
      data-test="grant-card"
      :title="`Give somebody ${saysRole(chosen)}`"
      description="Expires at the committee year end unless it is dated or marked permanent. Somebody who already has this role has their grant renewed. If the search finds nobody, you can grant it by address and it waits for their first sign-in."
    >
      <RoleGrantForm
        :role="chosen"
        @granted="granted"
      />
    </UPageCard>

    <AdminToolbar
      v-model:search="search"
      :placeholder="rolesList.search?.placeholder"
      :active="active"
      :loading="status === 'pending'"
      @clear="clear"
    >
      <template #filters>
        <ConsoleFilters
          :spec="rolesList"
          :conditions="conditions"
          :sort="sort"
          @set="set"
          @sort="setSort"
        />
      </template>
    </AdminToolbar>

    <UTable
      :data="register.items"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="holders-table"
      class="hidden sm:block"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ listingFailure ? listingFailure.message : filtered ? 'Nobody holds that.' : 'No role has been granted yet.' }}
        </p>
      </template>
    </UTable>

    <p
      v-if="!register.items.length"
      class="py-6 text-center text-sm text-muted sm:hidden"
    >
      {{ listingFailure ? listingFailure.message : filtered ? 'Nobody holds that.' : 'No role has been granted yet.' }}
    </p>
    <ul
      v-else
      class="space-y-3 sm:hidden"
      data-test="holders-cards"
    >
      <li
        v-for="holder in register.items"
        :key="holder.id"
        class="rounded-lg border border-default p-3 text-sm"
      >
        <div class="flex items-start justify-between gap-2">
          <div>
            <NuxtLink
              :to="`/people/accounts/${holder.userId}`"
              class="font-medium"
            >
              {{ holder.name }}
            </NuxtLink>
            <p class="font-mono text-xs text-muted">
              {{ holder.email }}
            </p>
          </div>
          <UBadge
            v-if="!holder.live"
            color="warning"
            variant="subtle"
            size="sm"
          >
            Lapsed
          </UBadge>
        </div>
        <p class="mt-1">
          {{ saysRole(holder.role) }}, until {{ when(holder.expiresAt) }}
        </p>
        <p
          v-if="holder.note"
          class="text-xs text-muted"
        >
          {{ holder.note }}
        </p>
        <UButton
          v-if="sees.revokes && holder.live"
          class="mt-2"
          size="xs"
          color="error"
          variant="ghost"
          label="Revoke"
          :loading="working === `${holder.userId}-${holder.role}`"
          @click="askRevoke(holder)"
        />
      </li>
    </ul>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="register-total"
        class="text-sm text-muted"
      >
        {{ totalLine }}
        <UButton
          v-if="register.lapsedHidden"
          data-test="show-lapsed"
          label="Show them"
          variant="link"
          size="sm"
          class="p-0"
          @click="set('lapsed', { key: 'lapsed', operator: 'is', values: ['true'] })"
        />
      </p>
      <UPagination
        v-if="register.pages > 1"
        v-model:page="page"
        :total="register.total"
        :items-per-page="register.pageSize"
      />
    </div>

    <UPageCard
      v-if="register.pending.length"
      data-test="pending-grants"
      title="Waiting for a first sign-in"
      description="Granted by address to somebody with no account yet. Not counted as holders until they sign in."
    >
      <ul class="space-y-1 text-sm">
        <li
          v-for="grant in register.pending"
          :key="grant.id"
          class="flex flex-wrap items-center justify-between gap-2"
        >
          <span>
            {{ grant.name }}
            <span class="font-mono text-xs text-muted">{{ grant.email }}</span>
            <span class="text-muted"> for {{ saysRole(grant.role) }}, until {{ when(grant.expiresAt) }}</span>
            <UBadge
              v-if="!grant.live"
              class="ml-1"
              color="warning"
              variant="subtle"
              size="sm"
            >
              Lapsed
            </UBadge>
          </span>
          <UButton
            v-if="sees.revokes"
            size="xs"
            color="error"
            variant="ghost"
            label="Revoke"
            :loading="working === `${grant.userId}-${grant.role}`"
            :data-test="`revoke-pending-${grant.userId}-${grant.role}`"
            @click="askRevoke(grant)"
          />
        </li>
      </ul>
    </UPageCard>

    <UPageCard
      data-test="permanent-report"
      title="Permanent grants"
      description="The exception to the committee year, kept in sight."
    >
      <p
        v-if="!register.permanent.length"
        class="text-sm text-muted"
      >
        None. Every grant expires at handover.
      </p>
      <ul
        v-else
        class="space-y-1 text-sm"
      >
        <li
          v-for="grant in register.permanent"
          :key="grant.id"
          class="flex flex-wrap items-center justify-between gap-2"
        >
          <span>
            <NuxtLink :to="`/people/accounts/${grant.userId}`">{{ grant.name }}</NuxtLink>
            <span class="text-muted"> holds {{ saysRole(grant.role) }}</span>
          </span>
          <span class="text-xs text-muted">
            granted {{ when(grant.grantedAt) }}{{ grant.grantedBy ? ` by ${grant.grantedBy}` : '' }}
          </span>
        </li>
      </ul>
    </UPageCard>

    <ConfirmModal
      :open="revoking !== null"
      name="revoke-role"
      :title="revoking ? `Revoke ${saysRole(revoking.role)} from ${revoking.name}` : ''"
      :verb="revoking ? `Revoke ${saysRole(revoking.role)}` : ''"
      consequence="Their permission stops now. Nothing they did under it is touched."
      :loading="working !== ''"
      :failure="revokeFailure"
      @update:open="value => { if (!value) revoking = null }"
      @confirm="revoke"
    />
  </div>
</template>
