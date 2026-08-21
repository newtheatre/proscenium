<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

const UBadge = resolveComponent('UBadge')

/**
 * The app-side view of the local mirror. Identity, credentials and roles live
 * in the auth service; this page links out.
 */
interface MirrorUser {
  id: string
  email: string
  name: string
  anonymisedAt: string | null
  createdAt: string
}

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
  title: 'Users',
})

const config = useRuntimeConfig()
const toast = useToast()

const q = ref('')
const page = ref(1)
const limit = 25

const debouncedQuery = useDebouncedRef(q, {
  onSettle: () => { page.value = 1 },
})

/**
 * `useRequestFetch()` is not optional — a plain useFetch on the server does not
 * forward the session cookie (ADR-0013).
 */
const requestFetch = useRequestFetch()
const { data, status, error, refresh } = await useAsyncData(
  'admin-users',
  () => requestFetch<Paginated<MirrorUser>>('/api/users', {
    query: {
      ...(debouncedQuery.value ? { q: debouncedQuery.value } : {}),
      page: page.value,
      limit,
    },
  }),
  {
    default: (): Paginated<MirrorUser> => ({ rows: [], total: 0, page: 1, limit }),
    watch: [page, debouncedQuery],
  },
)

const columns: TableColumn<MirrorUser>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    // Links to what this app knows about them; identity stays stage-door's.
    cell: ({ row }) => h(
      resolveComponent('NuxtLink'),
      { to: `/admin/users/${row.original.id}`, class: 'text-sm text-highlighted underline underline-offset-4' },
      () => row.original.name,
    ),
  },
  {
    accessorKey: 'email',
    header: 'Email',
    cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, row.original.email),
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => h(UBadge, {
      label: row.original.anonymisedAt ? 'Anonymised' : 'Active',
      color: row.original.anonymisedAt ? 'neutral' : 'success',
      variant: 'subtle',
    }),
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, formatDate(row.original.createdAt)),
  },
]

/**
 * Always an array, never null (ADR-0012). Columns render from the real record,
 * so dates and badges match every other page.
 */
const rows = computed<MirrorUser[]>(() => data.value?.rows ?? [])
const totalCount = computed(() => data.value?.total ?? 0)

/** Anonymised accounts are hidden from the listing but still counted, so say so. */
const hiddenNote = computed(() => {
  const hidden = data.value?.hiddenAnonymised
  return hidden ? `· ${formatCount(hidden)} anonymised not shown` : undefined
})

const createOpen = ref(false)
const creating = ref(false)
const createForm = reactive({ name: '', email: '' })

function openCreate() {
  createOpen.value = true
}

async function createUser() {
  creating.value = true
  try {
    const result = await $fetch<{ user: { existing: boolean } }>('/api/users', {
      method: 'POST',
      body: { ...createForm },
    })
    createOpen.value = false
    Object.assign(createForm, { name: '', email: '' })
    await refresh()
    toast.add({
      title: result.user.existing ? 'Existing NNT account linked' : 'User created',
      description: result.user.existing
        ? 'That email already has an NNT account — reservations will attach to it.'
        : 'They can claim the account later via forgot-password on the NNT login page.',
      color: 'success',
    })
  }
  catch (error) {
    toast.add({ title: getErrorMessage(error, 'Could not create user'), color: 'error' })
  }
  finally {
    creating.value = false
  }
}
</script>

<template>
  <AdminPage>
    <AdminTableToolbar>
      <template #left>
        <p class="text-muted">
          The local mirror of NNT accounts, used to attach reservations
        </p>
      </template>
      <template #right>
        <UButton
          :to="`${config.public.authBaseURL}/admin`"
          external
          target="_blank"
          variant="outline"
          icon="i-lucide-external-link"
          label="Manage accounts & roles"
        />
        <UButton
          icon="i-lucide-user-round-plus"
          label="Add user"
          @click="openCreate"
        />
      </template>
    </AdminTableToolbar>

    <UAlert
      icon="i-lucide-info"
      color="neutral"
      variant="subtle"
      title="Identity is managed centrally"
      description="Names, emails, passwords, roles, and verification are edited in the NNT account admin. This list shows the local mirror used to attach reservations."
    />

    <AdminFetchError
      v-if="error"
      :error="error"
      title="Could not load users"
      :on-retry="refresh"
    />

    <AdminTableToolbar>
      <template #left>
        <UInput
          v-model="q"
          placeholder="Search by name or email…"
          icon="i-lucide-search"
          class="flex-1"
        />
      </template>
    </AdminTableToolbar>

    <UTable
      :data="rows"
      :columns="columns"
      :loading="status === 'pending'"
      class="shrink-0"
    >
      <template #empty>
        <UEmpty
          icon="i-lucide-users"
          :title="debouncedQuery ? 'No users match your search' : 'No users yet'"
          :description="debouncedQuery ? 'Try a different name or email.' : 'Accounts appear here as people book or are added.'"
        />
      </template>
    </UTable>

    <AdminTablePagination
      v-model:page="page"
      :total="totalCount"
      :limit="limit"
      label="user"
      :suffix="hiddenNote"
    />

    <UModal
      v-model:open="createOpen"
      title="Add user"
      description="Creates an NNT account they can claim later — no passwords to hand out."
    >
      <template #body>
        <UForm
          :state="createForm"
          class="flex flex-col gap-4"
          @submit="createUser"
        >
          <UFormField
            label="Name"
            name="name"
            required
          >
            <UInput
              v-model="createForm.name"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Email"
            name="email"
            required
          >
            <UInput
              v-model="createForm.email"
              type="email"
              class="w-full"
            />
          </UFormField>
          <UButton
            type="submit"
            :loading="creating"
            class="self-end"
            label="Add user"
          />
        </UForm>
      </template>
    </UModal>
  </AdminPage>
</template>
