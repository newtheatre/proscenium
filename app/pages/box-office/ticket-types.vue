<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import {
  TICKET_TYPE_ACCESS_KINDS,
  TICKET_TYPE_KINDS,
  newTicketTypeForm,
  saysAccessKind,
  saysPrice,
  saysTicketTypeKind,
  ticketTypeForm,
} from '#shared/utils/ticket-types'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { TableColumn } from '@nuxt/ui'
import type { TicketType, TicketTypeAccessKind, TicketTypeKind } from '#shared/utils/ticket-types'

definePageMeta({ layout: 'console', title: 'Ticket types', middleware: 'console' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const request = useRequestFetch()
const toast = useToast()
const search = ref('')
const includeArchived = ref(true)
const page = ref(1)
const failure = ref<string | null>(null)
const saving = ref(false)

interface Listing { items: TicketType[], total: number, pageSize: number, pages: number }

const empty = (): Listing => ({ items: [], total: 0, pageSize: 0, pages: 1 })

// Searched and paged in SQL, so what the table shows and what the count says are the same
// question asked once (CONTRIBUTING).
const { data, status, error, refresh } = await useAsyncData(
  'ticket-types',
  () => request<Listing>('/api/admin/ticket-types', {
    query: { includeArchived: includeArchived.value, search: search.value.trim() || undefined, page: page.value },
  }),
  { watch: [page], default: empty },
)

watch([search, includeArchived], () => {
  if (page.value === 1) void refresh()
  else page.value = 1
})

const editing = ref<TicketType | null>(null)
const open = ref(false)
const removing = ref<TicketType | null>(null)

// A refusal belongs to the attempt that caused it, so closing the modal forgets it.
watch(open, (isOpen) => {
  if (!isOpen) failure.value = null
})

// Deleting or archiving the last row of the last page would otherwise leave the reader past the
// end, with no control to get back.
async function reload(): Promise<void> {
  await refresh()
  if (page.value > data.value.pages) page.value = data.value.pages
}

interface FormState {
  name: string
  description?: string
  price: number
  kind: TicketTypeKind
  accessKind: TicketTypeAccessKind | null
  activeByDefault: boolean
}

const state = reactive<FormState>({
  name: '',
  price: 0,
  kind: 'SINGLE',
  accessKind: null,
  activeByDefault: true,
})

// The field takes pounds and the request carries pence, converted here and nowhere else (0004).
const pounds = computed({
  get: () => state.price / 100,
  set: (value: number) => {
    state.price = Math.round((value ?? 0) * 100)
  },
})

const kindOptions = TICKET_TYPE_KINDS.map(kind => ({ label: saysTicketTypeKind(kind), value: kind }))
const accessOptions = [
  { label: 'Neither', value: null },
  ...TICKET_TYPE_ACCESS_KINDS.map(kind => ({ label: saysAccessKind(kind) ?? kind, value: kind })),
]

function edit(type: TicketType | null): void {
  editing.value = type
  failure.value = null
  Object.assign(state, {
    name: type?.name ?? '',
    description: type?.description ?? undefined,
    price: type?.price ?? 0,
    kind: type?.kind ?? 'SINGLE',
    accessKind: type?.accessKind ?? null,
    activeByDefault: type?.activeByDefault ?? true,
  })
  open.value = true
}

// The body is built from the state rather than the submitted data, because the edit form does
// not carry the kind or the access kind at all.
async function save(): Promise<void> {
  saving.value = true
  failure.value = null
  const body = {
    name: state.name.trim(),
    description: state.description?.trim() || null,
    price: state.price,
    activeByDefault: state.activeByDefault,
  }
  try {
    if (editing.value) {
      await $fetch(`/api/admin/ticket-types/${editing.value.id}`, { method: 'PUT', body })
    }
    else {
      await $fetch('/api/admin/ticket-types', {
        method: 'POST',
        body: { ...body, kind: state.kind, accessKind: state.accessKind },
      })
    }
    toast.add({
      title: editing.value ? 'Ticket type changed' : 'Ticket type added',
      icon: 'i-lucide-check',
      color: 'success',
    })
    open.value = false
    await reload()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

async function setArchived(type: TicketType, archived: boolean): Promise<void> {
  failure.value = null
  try {
    await $fetch(`/api/admin/ticket-types/${type.id}/archive`, { method: 'POST', body: { archived } })
    toast.add({
      title: archived ? 'Ticket type archived' : 'Ticket type back in use',
      description: archived ? 'It stops appearing for new sales and still resolves for every ticket already sold.' : undefined,
      icon: 'i-lucide-check',
      color: 'success',
    })
    await reload()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
}

async function remove(): Promise<void> {
  const type = removing.value
  if (!type) return

  saving.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/ticket-types/${type.id}`, { method: 'DELETE' })
    toast.add({ title: 'Ticket type deleted', icon: 'i-lucide-check', color: 'success' })
    removing.value = null
    await reload()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

// A listing that refused says so, or the table quietly keeps showing rows the filters no longer
// describe.
const listingFailure = computed(() => (error.value ? refusalText(error.value, 'The ticket types could not be read.') : null))

const activeFilters = computed<ActiveFilter[]>(() => {
  const active: ActiveFilter[] = []
  if (search.value) {
    active.push({ key: 'search', label: `Matching ${search.value}`, icon: 'i-lucide-search', clear: () => {
      search.value = ''
    } })
  }
  if (!includeArchived.value) {
    active.push({ key: 'archived', label: 'Hiding archived', icon: 'i-lucide-archive', clear: () => {
      includeArchived.value = true
    } })
  }
  return active
})

const columns: TableColumn<TicketType>[] = [
  {
    id: 'name',
    header: 'Ticket type',
    cell: ({ row }) => h('div', {}, [
      h('div', { class: 'flex flex-wrap items-center gap-2' }, [
        h('span', {}, row.original.name),
        row.original.kind === 'PASS_ADMISSION'
          ? h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => saysTicketTypeKind(row.original.kind))
          : null,
        row.original.accessKind
          ? h(UBadge, { color: 'info', variant: 'subtle', size: 'sm' }, () => saysAccessKind(row.original.accessKind))
          : null,
        row.original.archived
          ? h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => 'Archived')
          : null,
        row.original.activeByDefault
          ? null
          : h(UBadge, { color: 'neutral', variant: 'outline', size: 'sm' }, () => 'Off by default'),
      ]),
      row.original.description ? h('div', { class: 'text-xs text-muted' }, row.original.description) : null,
    ]),
  },
  {
    id: 'price',
    header: 'Base price',
    meta: { class: { td: 'whitespace-nowrap' } },
    cell: ({ row }) => saysPrice(row.original.price),
  },
  {
    id: 'sold',
    header: 'Sold under',
    cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, row.original.everSold ? 'Has been sold' : 'Never sold'),
  },
  {
    id: 'act',
    header: '',
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => h('div', { class: 'flex justify-end gap-1' }, [
      h(UButton, {
        'size': 'sm',
        'color': 'neutral',
        'variant': 'ghost',
        'data-test': `edit-${row.original.id}`,
        'onClick': () => edit(row.original),
      }, () => 'Edit'),
      h(UButton, {
        'size': 'sm',
        'color': 'neutral',
        'variant': 'ghost',
        'data-test': `archive-${row.original.id}`,
        'onClick': () => setArchived(row.original, !row.original.archived),
      }, () => (row.original.archived ? 'Put back' : 'Archive')),
      row.original.everSold
        ? null
        : h(UButton, {
            'size': 'sm',
            'color': 'error',
            'variant': 'ghost',
            'data-test': `delete-${row.original.id}`,
            'onClick': () => {
              failure.value = null
              removing.value = row.original
            },
          }, () => 'Delete'),
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
      :description="listingFailure"
    />

    <UAlert
      v-if="failure && !open && removing === null"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-tag"
      title="A ticket type is retired, never destroyed"
      description="Once anything has been sold under a type, it can only be archived: an archived type stops appearing for new sales and still resolves for every ticket, report and export behind it. A type nothing has ever been sold under can be deleted outright."
    />

    <AdminToolbar
      v-model:search="search"
      placeholder="A ticket type"
      :active="activeFilters"
      :loading="status === 'pending'"
      @clear="search = ''; includeArchived = true"
    >
      <template #filters>
        <UFormField label="Show">
          <USwitch
            v-model="includeArchived"
            label="Including archived types"
            data-test="types-archived"
          />
        </UFormField>
      </template>

      <template #actions>
        <UButton
          data-test="add-ticket-type"
          icon="i-lucide-plus"
          @click="edit(null)"
        >
          Add a ticket type
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="data.items"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="ticket-types-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ search ? 'No ticket type matches that.' : 'No ticket types yet. Add one and a performance has something to sell.' }}
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="ticket-types-total"
        class="text-sm text-muted"
      >
        {{ plural(data.total, 'ticket type') }}
      </p>
      <UPagination
        v-if="data.pages > 1"
        v-model:page="page"
        :total="data.total"
        :items-per-page="data.pageSize"
      />
    </div>

    <UModal
      v-model:open="open"
      :title="editing ? `Edit ${editing.name}` : 'Add a ticket type'"
      description="The name is global and held once. What a type is, and whether it is an access or companion type, is fixed when it is created."
    >
      <template #body>
        <UForm
          :schema="editing ? ticketTypeForm : newTicketTypeForm"
          :state="state"
          class="space-y-4"
          data-test="ticket-type-form"
          @submit="save"
        >
          <UAlert
            v-if="failure"
            data-test="form-failure"
            color="error"
            variant="subtle"
            :description="failure"
          />
          <UFormField
            label="Name"
            name="name"
            required
            description="What the box office and every report calls it. Standard, Member, Concession."
          >
            <UInput
              v-model="state.name"
              class="w-full"
              data-test="ticket-type-name"
            />
          </UFormField>

          <UFormField
            label="Base price"
            name="price"
            required
            description="In pounds. A show or a performance can override it later."
          >
            <UInputNumber
              v-model="pounds"
              :min="0"
              :step="0.5"
              :format-options="{ style: 'currency', currency: 'GBP' }"
              class="w-full"
              data-test="ticket-type-price"
            />
          </UFormField>

          <UFormField
            label="What it is for"
            name="description"
            hint="Optional"
          >
            <UTextarea
              v-model="state.description"
              :rows="2"
              class="w-full"
            />
          </UFormField>

          <UFormField
            v-if="!editing"
            label="Kind"
            name="kind"
            description="A pass admission seats a pass holder rather than taking money at the desk."
          >
            <USelect
              v-model="state.kind"
              :items="kindOptions"
              class="w-full"
              data-test="ticket-type-kind"
            />
          </UFormField>

          <UFormField
            v-if="!editing"
            label="Access or companion"
            name="accessKind"
            description="A flagged type is offered only to a verified access booker, and never appears on a public page."
          >
            <USelect
              v-model="state.accessKind"
              :items="accessOptions"
              class="w-full"
              data-test="ticket-type-access"
            />
          </UFormField>

          <USwitch
            v-model="state.activeByDefault"
            label="Offered on a new performance"
            description="A type that is off by default has to be turned on per show or per performance."
            data-test="ticket-type-active"
          />

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              :loading="saving"
              data-test="ticket-type-submit"
            >
              {{ editing ? 'Save it' : 'Add it' }}
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="open = false"
            >
              Back
            </UButton>
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal
      :open="removing !== null"
      :title="removing ? `Delete ${removing.name}` : ''"
      description="Nothing has ever been sold under this type, so there is no history to keep. Deleting it also removes the show and performance prices set for it."
      @update:open="removing = null; failure = null"
    >
      <template #body>
        <UAlert
          v-if="failure"
          data-test="delete-failure"
          color="error"
          variant="subtle"
          :description="failure"
        />
        <p
          v-else
          class="text-sm text-muted"
        >
          This cannot be undone, and there is nothing behind it to lose.
        </p>
      </template>

      <template #footer>
        <UButton
          color="error"
          :loading="saving"
          data-test="confirm-delete"
          @click="remove"
        >
          Delete it
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="removing = null"
        >
          Back
        </UButton>
      </template>
    </UModal>
  </div>
</template>
