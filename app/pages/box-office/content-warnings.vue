<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import {
  CONTENT_WARNING_CATEGORIES,
  CONTENT_WARNING_ICONS,
  CONTENT_WARNING_KINDS,
  contentWarningForm,
  saysWarningKind,
} from '#shared/utils/content-warnings'
import { contentWarningsList } from '#shared/utils/content-warnings-list'
import type { TableColumn } from '@nuxt/ui'
import type { ContentWarning, ContentWarningKind } from '#shared/utils/content-warnings'

definePageMeta({ layout: 'console', title: 'Content warnings', middleware: 'console', docs: '/docs/box-office/content-warnings' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const request = useRequestFetch()
const toast = useToast()
const failure = ref<string | null>(null)
const saving = ref(false)

interface Listing { items: ContentWarning[], total: number, pageSize: number, pages: number }

const empty = (): Listing => ({ items: [], total: 0, pageSize: 0, pages: 1 })

// Search, filters, sort and page live in the URL (K-129); the list refetches when any changes.
const { search, conditions, sort, page, query, active, filtered, set, setSort, clear } = useListQuery(contentWarningsList)

const { data, status, error, refresh } = await useAsyncData(
  'content-warnings',
  () => request<Listing>('/api/admin/content-warnings', { query: query.value }),
  { watch: [query], default: empty },
)

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

const KIND_HINTS: Record<ContentWarningKind, string> = {
  TECHNICAL: 'A fact about the room: strobe, haze, a blackout. Either the show does it or it does not.',
  GENERAL: 'A theme. Each show that carries it grades it mentioned, discussed or depicted.',
}
const kindOptions = CONTENT_WARNING_KINDS.map(kind => ({ label: saysWarningKind(kind), value: kind, hint: KIND_HINTS[kind] }))

const categoryOptions: string[] = [...CONTENT_WARNING_CATEGORIES]
const iconOptions: string[] = [...CONTENT_WARNING_ICONS]

// A staging warning is its own group on every screen, so a heading on it would never be read.
watch(() => state.kind, (kind) => {
  if (kind === 'TECHNICAL') state.category = undefined
})

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
    header: () => h('span', { class: 'sr-only' }, 'Actions'),
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

    <p class="text-sm text-muted">
      The vocabulary every show warns from.
    </p>

    <AdminToolbar
      v-model:search="search"
      :placeholder="contentWarningsList.search?.placeholder"
      :active="active"
      :loading="status === 'pending'"
      @clear="clear"
    >
      <template #filters>
        <ConsoleFilters
          :spec="contentWarningsList"
          :conditions="conditions"
          :sort="sort"
          @set="set"
          @sort="setSort"
        />
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
          {{ filtered ? 'No warning matches that.' : 'Nothing in the vocabulary yet. Add a warning and a show has something to choose from.' }}
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
          >
            <URadioGroup
              v-model="state.kind"
              :items="kindOptions"
              value-key="value"
              label-key="label"
              description-key="hint"
              variant="card"
              size="sm"
              :disabled="Boolean(editing && editing.showCount > 0)"
              data-test="warning-kind"
            />
          </UFormField>

          <UFormField
            v-if="state.kind === 'GENERAL'"
            label="Grouped under"
            name="category"
            hint="Optional"
            description="The heading the editor offers it under. Pick one of the usual headings, or type a new one."
          >
            <UInputMenu
              v-model="state.category"
              :items="categoryOptions"
              create-item
              placeholder="Other"
              class="w-full"
              data-test="warning-category"
              @create="(value: string) => { state.category = value }"
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
              label="Icon"
              name="icon"
              hint="Optional"
              description="Shown on the badge."
            >
              <USelectMenu
                v-model="state.icon"
                :items="iconOptions"
                placeholder="None"
                class="w-full"
                data-test="warning-icon"
              >
                <template #leading>
                  <UIcon
                    v-if="state.icon"
                    :name="state.icon"
                    class="size-5"
                  />
                </template>
                <template #item-leading="{ item }">
                  <UIcon
                    :name="item"
                    class="size-5"
                  />
                </template>
              </USelectMenu>
            </UFormField>

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
              {{ CONFIRM_BACK_LABEL }}
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
      title="Delete this warning"
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
              {{ CONFIRM_BACK_LABEL }}
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
