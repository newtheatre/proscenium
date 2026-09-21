<script setup lang="ts">
import { h } from 'vue'
import { discountForm } from '#shared/utils/discounts'
import type { Discount } from '#shared/utils/discounts'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Discounts', middleware: 'console', docs: '/docs/bar/discounts' })

const request = useRequestFetch()
const toast = useToast()
const failure = ref<string | null>(null)
const saving = ref(false)

interface Listing { items: Discount[], total: number, pageSize: number, pages: number }

const empty = (): Listing => ({ items: [], total: 0, pageSize: 0, pages: 1 })

// The route has no search or sort yet (Stream 3's file): a page number is the whole of it.
const page = ref(1)
const query = computed(() => ({ page: page.value }))

const { data, status, error, refresh } = await useAsyncData(
  'bar-discounts',
  () => request<Listing>('/api/admin/bar/discounts', { query: query.value }),
  { watch: [query], default: empty },
)

const listingFailure = useListFailure(error, 'The discounts could not be read.')

const editing = ref<Discount | null>(null)
const open = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) failure.value = null
})

const state = reactive({ name: '', percent: 0 })

function edit(discount: Discount | null): void {
  editing.value = discount
  failure.value = null
  Object.assign(state, { name: discount?.name ?? '', percent: discount?.percent ?? 0 })
  open.value = true
}

async function save(): Promise<void> {
  saving.value = true
  failure.value = null
  const body = { name: state.name.trim(), percent: state.percent }
  try {
    if (editing.value) await $fetch(`/api/admin/bar/discounts/${editing.value.id}`, { method: 'PUT', body })
    else await $fetch('/api/admin/bar/discounts', { method: 'POST', body })

    toast.add({
      title: editing.value ? 'Discount changed' : 'Discount added',
      description: 'A sale already given this discount keeps its own snapshot: this only changes what applying it does from now on.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    open.value = false
    await refresh()
  }
  catch (refused) {
    // Verbatim: the cap and both figures are the route's own words, not softened here (issue 1051).
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

// Retiring confirms; putting a discount back does not (K-123 criterion 7).
const retiring = ref<Discount | null>(null)
const retireFailure = ref<string | null>(null)
const retireWorking = ref(false)

async function retire(): Promise<void> {
  const discount = retiring.value
  if (!discount) return
  retireWorking.value = true
  retireFailure.value = null
  try {
    await $fetch(`/api/admin/bar/discounts/${discount.id}/status`, { method: 'POST', body: { status: 'RETIRED' } })
    toast.add({ title: `${discount.name} is retired`, icon: 'i-lucide-check', color: 'success' })
    retiring.value = null
    await refresh()
  }
  catch (refused) {
    retireFailure.value = refusalText(refused)
  }
  finally {
    retireWorking.value = false
  }
}

async function setStatus(discount: Discount, status: Discount['status']): Promise<void> {
  failure.value = null
  try {
    await $fetch(`/api/admin/bar/discounts/${discount.id}/status`, { method: 'POST', body: { status } })
    toast.add({
      title: status === 'RETIRED' ? `${discount.name} is retired` : `${discount.name} is back`,
      icon: 'i-lucide-check',
      color: 'success',
    })
    await refresh()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
}

const columns: TableColumn<Discount>[] = [
  {
    id: 'name',
    header: 'Discount',
    cell: ({ row }) => h('div', { class: 'flex items-center gap-2' }, [
      h('span', {}, row.original.name),
      row.original.status === 'RETIRED'
        ? h(resolveComponent('UBadge'), { color: 'neutral', variant: 'outline', size: 'sm' }, () => 'Retired')
        : null,
    ]),
  },
  { id: 'percent', header: 'Percent', cell: ({ row }) => `${row.original.percent}%` },
  {
    id: 'act',
    header: ACTIONS_HEADER,
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => h('div', { class: 'flex justify-end gap-1' }, [
      h(resolveComponent('UButton'), {
        'size': 'sm',
        'color': 'neutral',
        'variant': 'ghost',
        'data-test': `edit-${row.original.id}`,
        'onClick': () => edit(row.original),
      }, () => 'Edit'),
      h(resolveComponent('UButton'), {
        'size': 'sm',
        'color': 'neutral',
        'variant': 'ghost',
        'data-test': `status-${row.original.id}`,
        'onClick': () => {
          if (row.original.status === 'RETIRED') return void setStatus(row.original, 'ACTIVE')
          retireFailure.value = null
          retiring.value = row.original
        },
      }, () => (row.original.status === 'RETIRED' ? 'Put back' : 'Retire')),
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

    <!-- Retire and Put back act from the table, with no modal open to show the form's own alert. -->
    <UAlert
      v-if="failure && !open"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-percent"
      title="A percentage, capped by configuration"
      description="Applying a discount snapshots its percentage onto the sale line at the moment of sale, so a later edit or retirement never restates a charge already made. Retiring stops it applying to a new sale; it is never deleted."
    />

    <AdminToolbar
      :searchable="false"
      :filterable="false"
      :loading="status === 'pending'"
    >
      <template #actions>
        <UButton
          data-test="add-discount"
          icon="i-lucide-plus"
          @click="edit(null)"
        >
          Add a discount
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="data.items"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="bar-discounts-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          No discounts yet. Add one and the till can offer it.
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="bar-discounts-total"
        class="text-sm text-muted"
      >
        {{ plural(data.total, 'discount') }}
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
      :title="editing ? `Edit ${editing.name}` : 'Add a discount'"
      description="A percentage off, applied at the till and snapshotted onto every sale line it touches."
    >
      <template #body>
        <UForm
          :schema="discountForm"
          :state="state"
          class="space-y-4"
          data-test="discount-form"
          @submit="save"
        >
          <UAlert
            v-if="failure"
            data-test="discount-failure"
            color="error"
            variant="subtle"
            :description="failure"
          />

          <UFormField
            label="Name"
            name="name"
            required
            description="What the till button and every report call it."
          >
            <UInput
              v-model="state.name"
              class="w-full"
              data-test="discount-name"
            />
          </UFormField>

          <UFormField
            label="Percent off"
            name="percent"
            required
            description="A whole number, 1 to 100. Refused above the configured cap."
          >
            <UInputNumber
              v-model="state.percent"
              :min="1"
              :max="100"
              class="w-full"
              data-test="discount-percent"
            />
          </UFormField>

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              :loading="saving"
              data-test="discount-submit"
            >
              {{ editing ? 'Save it' : 'Add it' }}
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="open = false"
            >
              {{ CONFIRM_BACK_LABEL }}
            </UButton>
          </div>
        </UForm>
      </template>
    </UModal>

    <ConfirmModal
      :open="retiring !== null"
      name="retire-discount"
      :title="retiring ? `Retire ${retiring.name}` : ''"
      :verb="retiring ? `Retire ${retiring.name}` : ''"
      consequence="The till stops offering it. Sales that already took it are untouched."
      :loading="retireWorking"
      :failure="retireFailure"
      @update:open="value => { if (!value) retiring = null }"
      @confirm="retire"
    />
  </div>
</template>
