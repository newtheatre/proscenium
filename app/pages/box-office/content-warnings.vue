<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import {
  CONTENT_WARNING_KINDS,
  contentWarningForm,
  saysWarningKind,
} from '#shared/utils/content-warnings'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { TableColumn } from '@nuxt/ui'
import type { ContentWarning, ContentWarningKind } from '#shared/utils/content-warnings'

definePageMeta({ layout: 'console', title: 'Content warnings', middleware: 'console' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const request = useRequestFetch()
const toast = useToast()
const search = ref('')
const includeArchived = ref(true)
const page = ref(1)
const failure = ref<string | null>(null)
const saving = ref(false)

interface Listing { items: ContentWarning[], total: number, pageSize: number, pages: number }

const empty = (): Listing => ({ items: [], total: 0, pageSize: 0, pages: 1 })

const { data, status, error, refresh } = await useAsyncData(
  'content-warnings',
  () => request<Listing>('/api/admin/content-warnings', {
    query: { includeArchived: includeArchived.value, search: search.value.trim() || undefined, page: page.value },
  }),
  { watch: [page], default: empty },
)

watch([search, includeArchived], () => {
  if (page.value === 1) void refresh()
  else page.value = 1
})

const editing = ref<ContentWarning | null>(null)
const open = ref(false)
const removing = ref<ContentWarning | null>(null)

// A refusal belongs to the attempt that caused it, so closing the modal forgets it.
watch(open, (isOpen) => {
  if (!isOpen) failure.value = null
})

async function reload(): Promise<void> {
  await refresh()
  if (page.value > data.value.pages) page.value = data.value.pages
}

interface FormState {
  slug: string
  title: string
  kind: ContentWarningKind
  category?: string
  description?: string
  icon?: string
  sort: number
  archived: boolean
}

const state = reactive<FormState>({ slug: '', title: '', kind: 'GENERAL', sort: 0, archived: false })

const kindOptions = CONTENT_WARNING_KINDS.map(kind => ({ label: saysWarningKind(kind), value: kind }))

function edit(warning: ContentWarning | null): void {
  editing.value = warning
  failure.value = null
  Object.assign(state, {
    slug: warning?.slug ?? '',
    title: warning?.title ?? '',
    kind: warning?.kind ?? 'GENERAL',
    category: warning?.category ?? undefined,
    description: warning?.description ?? undefined,
    icon: warning?.icon ?? undefined,
    sort: warning?.sort ?? 0,
    archived: warning?.archived ?? false,
  })
  open.value = true
}

// The address writes itself from the title until somebody types one, so nobody has to know what
// a slug is to add a warning.
watch(() => state.title, (title) => {
  if (!editing.value) state.slug = toSlug(title)
})

async function save(): Promise<void> {
  saving.value = true
  failure.value = null
  const body = {
    slug: state.slug.trim(),
    title: state.title.trim(),
    kind: state.kind,
    category: state.category?.trim() || null,
    description: state.description?.trim() || null,
    icon: state.icon?.trim() || null,
    sort: state.sort,
    archived: state.archived,
  }
  try {
    if (editing.value) await $fetch(`/api/admin/content-warnings/${editing.value.id}`, { method: 'PUT', body })
    else await $fetch('/api/admin/content-warnings', { method: 'POST', body })
    toast.add({
      title: editing.value ? 'Content warning changed' : 'Content warning added',
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

async function remove(): Promise<void> {
  const warning = removing.value
  if (!warning) return

  saving.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/content-warnings/${warning.id}`, { method: 'DELETE' })
    toast.add({ title: 'Content warning deleted', icon: 'i-lucide-check', color: 'success' })
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

const listingFailure = computed(() => (error.value ? refusalText(error.value, 'The vocabulary could not be read.') : null))

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

const columns: TableColumn<ContentWarning>[] = [
  {
    id: 'title',
    header: 'Warning',
    cell: ({ row }) => h('div', {}, [
      h('div', { class: 'flex flex-wrap items-center gap-2' }, [
        h('span', {}, row.original.title),
        h(UBadge, {
          color: row.original.kind === 'TECHNICAL' ? 'info' : 'neutral',
          variant: 'subtle',
          size: 'sm',
        }, () => saysWarningKind(row.original.kind)),
        row.original.archived
          ? h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => 'Archived')
          : null,
      ]),
      row.original.description ? h('div', { class: 'text-xs text-muted' }, row.original.description) : null,
    ]),
  },
  {
    id: 'category',
    header: 'Grouped under',
    cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, row.original.category ?? 'Nothing'),
  },
  {
    id: 'shows',
    header: 'Carried by',
    meta: { class: { td: 'whitespace-nowrap' } },
    cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, plural(row.original.showCount, 'show')),
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
        'data-test': `edit-warning-${row.original.id}`,
        'onClick': () => edit(row.original),
      }, () => 'Edit'),
      row.original.showCount > 0
        ? null
        : h(UButton, {
            'size': 'sm',
            'color': 'error',
            'variant': 'ghost',
            'data-test': `delete-warning-${row.original.id}`,
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
      icon="i-lucide-triangle-alert"
      title="A show warns from this list, never in its own words"
      description="Two shows warning about the same thing say it in the same words, which is what makes a warning something a theatregoer can weigh. A content warning is graded mentioned, discussed or depicted; a staging warning is a fact about the room and is not graded."
    />

    <AdminToolbar
      v-model:search="search"
      placeholder="A warning"
      :active="activeFilters"
      :loading="status === 'pending'"
      @clear="search = ''; includeArchived = true"
    >
      <template #filters>
        <UFormField label="Show">
          <USwitch
            v-model="includeArchived"
            label="Including archived warnings"
            data-test="warnings-archived"
          />
        </UFormField>
      </template>

      <template #actions>
        <UButton
          data-test="add-warning"
          icon="i-lucide-plus"
          @click="edit(null)"
        >
          Add a warning
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="data.items"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="warnings-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ search ? 'No warning matches that.' : 'Nothing in the vocabulary yet. Add a warning and a show has something to choose from.' }}
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="warnings-total"
        class="text-sm text-muted"
      >
        {{ plural(data.total, 'warning') }}
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
      :title="editing ? `Edit ${editing.title}` : 'Add a content warning'"
      description="The title is what a show page prints. Whether a warning is graded follows from its kind, so a kind cannot change once a show carries it."
    >
      <template #body>
        <UForm
          :schema="contentWarningForm"
          :state="state"
          class="space-y-4"
          data-test="warning-form"
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
            label="Title"
            name="title"
            required
            description="What the show page prints. Strong language, Death, Strobe lighting."
          >
            <UInput
              v-model="state.title"
              class="w-full"
              data-test="warning-title"
            />
          </UFormField>

          <UFormField
            label="Address"
            name="slug"
            required
            description="Lowercase words joined by hyphens. Written from the title until you change it."
          >
            <UInput
              v-model="state.slug"
              class="w-full"
              data-test="warning-slug"
            />
          </UFormField>

          <UFormField
            label="Kind"
            name="kind"
            description="Content is graded mentioned, discussed or depicted. Staging is a fact about the room, and is not graded."
          >
            <USelect
              v-model="state.kind"
              :items="kindOptions"
              :disabled="Boolean(editing && editing.showCount > 0)"
              class="w-full"
              data-test="warning-kind"
            />
          </UFormField>

          <UFormField
            label="Grouped under"
            name="category"
            hint="Optional"
            description="A heading the show page groups warnings by."
          >
            <UInput
              v-model="state.category"
              class="w-full"
              data-test="warning-category"
            />
          </UFormField>

          <UFormField
            label="What it means"
            name="description"
            hint="Optional"
          >
            <UTextarea
              v-model="state.description"
              :rows="2"
              class="w-full"
            />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              label="Order"
              name="sort"
              description="Lower comes first within its kind."
            >
              <UInputNumber
                v-model="state.sort"
                :min="0"
                class="w-full"
                data-test="warning-sort"
              />
            </UFormField>

            <UFormField
              label="In use"
              name="archived"
            >
              <USwitch
                v-model="state.archived"
                label="Archived"
                data-test="warning-archived"
              />
            </UFormField>
          </div>

          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              @click="open = false"
            >
              Cancel
            </UButton>
            <UButton
              type="submit"
              :loading="saving"
              data-test="save-warning"
            >
              Save
            </UButton>
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal
      :open="removing !== null"
      title="Delete this warning?"
      description="No show carries it, so nothing on the public site changes. A warning a show carries can only be archived."
      @update:open="value => { if (!value) removing = null }"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert
            v-if="failure"
            data-test="delete-failure"
            color="error"
            variant="subtle"
            :description="failure"
          />
          <p class="text-sm">
            {{ removing?.title }}
          </p>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              @click="removing = null"
            >
              Keep it
            </UButton>
            <UButton
              color="error"
              :loading="saving"
              data-test="confirm-delete-warning"
              @click="remove"
            >
              Delete
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
