<script lang="ts" setup>
/**
 * Admin Users Page — stage-door integration.
 *
 * Identity, credentials, roles, and verification live in the central auth
 * service; this page is the app-side view of the local user mirror (who
 * exists here for reservations) plus shadow-account creation for walk-ins.
 * Everything else deep-links to the auth service admin.
 */
interface MirrorUser {
  id: string
  email: string
  name: string
  anonymisedAt: string | null
  createdAt: string
}

interface Paginated<T> {
  rows: T[]
  total: number
  page: number
  limit: number
  hiddenAnonymised?: number
}

definePageMeta({
  layout: 'admin',
  middleware: 'admin',
  title: 'Users',
})

const config = useRuntimeConfig()
const toast = useToast()

const q = ref('')
const page = ref(1)
const limit = 25

const query = computed(() => ({
  ...(q.value ? { q: q.value } : {}),
  page: page.value,
  limit,
}))

watch(q, () => {
  page.value = 1
})

const { data, status, refresh } = await useFetch<Paginated<MirrorUser>>('/api/users', { query })

const columns = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'created', header: 'Created' },
]

const rows = computed(() => (data.value?.rows ?? []).map(user => ({
  name: user.name,
  email: user.email,
  status: user.anonymisedAt ? 'Anonymised' : 'Active',
  created: new Date(user.createdAt).toLocaleDateString('en-GB'),
})))

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
  <div class="flex flex-col gap-4">
    <UAlert
      icon="i-lucide-info"
      color="neutral"
      variant="subtle"
      title="Identity is managed centrally"
      description="Names, emails, passwords, roles, and verification are edited in the NNT account admin. This list shows the local mirror used to attach reservations."
    />

    <div class="flex flex-wrap gap-2 items-center">
      <UInput
        v-model="q"
        placeholder="Search by name or email…"
        icon="i-lucide-search"
        class="w-72"
      />
      <div class="flex-1" />
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
    </div>

    <UTable
      :data="rows"
      :columns="columns"
      :loading="status === 'pending'"
    />

    <div class="flex items-center justify-between">
      <p class="text-sm text-muted">
        {{ data?.total ?? 0 }} users
        <template v-if="data?.hiddenAnonymised">
          · {{ data.hiddenAnonymised.toLocaleString() }} anonymised accounts not shown
        </template>
      </p>
      <UPagination
        v-model:page="page"
        :total="data?.total ?? 0"
        :items-per-page="limit"
      />
    </div>

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
  </div>
</template>
