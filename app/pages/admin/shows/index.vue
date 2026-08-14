<!--
  Admin: Shows & Performances

  Three tabs over one tree table:
   - Now & next — published shows whose run has not finished. Server-rendered.
   - Drafts     — unpublished, whatever the dates. Server-rendered.
   - Archive    — everything that has finished, paged and searched on the server.

  Tabs rather than stacked sections on purpose: stacking would mount three
  UTables at once, tripling the TanStack instances and the surface for the render
  loop documented in docs/02-architecture.md. The two server-rendered tabs are
  fetched regardless, so switching between them is instant.

  This replaces a single unpaginated tree over the whole archive — 498 shows and
  1,304 performances in one table, filtered in the browser.

  @route /admin/shows
  @admin-only
-->
<script setup lang="ts">
import type { PerformanceListItem, ShowListItem, ShowRowAction } from '~~/shared/types/shows'

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
  title: 'Shows',
})

// Hoisted: an inline `:items` allocates a fresh array per render, which is the
// same class of problem as building a table's `:data` in the template.
const TABS = [
  { value: 'active', label: 'Now & next', icon: 'i-lucide-calendar-check' },
  { value: 'draft', label: 'Drafts', icon: 'i-lucide-pencil-line' },
  { value: 'archive', label: 'Archive', icon: 'i-lucide-archive' },
] as const

const tab = ref<'active' | 'draft' | 'archive'>('active')

type ShowPage = Paginated<ShowListItem>
const emptyPage = (): ShowPage => ({ rows: [], total: 0, page: 1, limit: 50 })

// requestFetch, not a plain useFetch: every admin endpoint is behind
// authorize(), and a plain useFetch running on the server does not forward the
// session cookie — it would 403 during SSR. See docs/02-architecture.md.
const requestFetch = useRequestFetch()

const {
  data: activePage,
  status: activeStatus,
  error: activeError,
  refresh: refreshActive,
} = await useAsyncData(
  'admin-shows-active',
  () => requestFetch<ShowPage>('/api/shows', {
    query: { scope: 'active', view: 'tree', limit: 50, sort: 'run', order: 'asc' },
  }),
  { default: emptyPage },
)

const {
  data: draftPage,
  status: draftStatus,
  error: draftError,
  refresh: refreshDrafts,
} = await useAsyncData(
  'admin-shows-drafts',
  () => requestFetch<ShowPage>('/api/shows', {
    query: { scope: 'draft', view: 'tree', limit: 50, sort: 'run', order: 'asc' },
  }),
  { default: emptyPage },
)

// ── Archive ──────────────────────────────────────────────────────────────────
// Deferred until the tab is opened: it is the only one that costs a request the
// reader has not asked for, and most visits never leave "Now & next".

const archiveSearch = ref('')
const archiveFrom = ref('')
const archiveTo = ref('')
const archivePage = ref(1)
const ARCHIVE_LIMIT = 25

const debouncedArchiveSearch = useDebouncedRef(archiveSearch, {
  onSettle: () => { archivePage.value = 1 },
})

watch([archiveFrom, archiveTo], () => {
  archivePage.value = 1
})

const {
  data: archiveData,
  status: archiveStatus,
  error: archiveError,
  refresh: refreshArchive,
} = await useAsyncData(
  'admin-shows-archive',
  () => requestFetch<ShowPage>('/api/shows', {
    query: {
      scope: 'archive',
      view: 'tree',
      sort: 'run',
      order: 'desc',
      page: archivePage.value,
      limit: ARCHIVE_LIMIT,
      q: debouncedArchiveSearch.value || undefined,
      from: archiveFrom.value || undefined,
      to: archiveTo.value || undefined,
    },
  }),
  {
    default: emptyPage,
    lazy: true,
    immediate: false,
    watch: [archivePage, debouncedArchiveSearch, archiveFrom, archiveTo],
  },
)

let archiveLoaded = false
watch(tab, (value) => {
  if (value === 'archive' && !archiveLoaded) {
    archiveLoaded = true
    refreshArchive()
  }
})

// Bound as computeds, never as template expressions — see the note on
// AdminShowsTreeTable's `rows` prop.
const activeRows = computed(() => activePage.value?.rows ?? [])
const draftRows = computed(() => draftPage.value?.rows ?? [])
const archiveRows = computed(() => archiveData.value?.rows ?? [])
const archiveFiltered = computed(() =>
  Boolean(debouncedArchiveSearch.value || archiveFrom.value || archiveTo.value),
)

/**
 * A show can move between tabs when it is published, cancelled or deleted, so a
 * mutation refreshes every tab that has been loaded rather than guessing which
 * one it landed in.
 */
async function refreshAll() {
  await Promise.all([
    refreshActive(),
    refreshDrafts(),
    ...(archiveLoaded ? [refreshArchive()] : []),
  ])
}

const actions = useShowActions(refreshAll)

// ── Modal state ──────────────────────────────────────────────────────────────

const addPerformanceToShow = ref<ShowListItem | null>(null)
const performanceToEdit = ref<PerformanceListItem | null>(null)
const performanceForTicketTypes = ref<PerformanceListItem | null>(null)
const performanceForTicketTypesLabel = ref('')
const performanceForTicketTypesShowTitle = ref('')

/**
 * One handler for every row action, exhaustive over the union — adding a case to
 * `ShowRowAction` without handling it here is a type error rather than a menu
 * item that silently does nothing.
 */
function onRowAction(action: ShowRowAction) {
  switch (action.type) {
    case 'open-show':
      navigateTo(`/admin/shows/${action.show.id}`)
      break
    case 'show-ticket-types':
      // Ticket types are a section of the show's own page now, not a dialog.
      // One place to manage a show beats two entry points to the same form.
      navigateTo(`/admin/shows/${action.show.id}#ticket-types`)
      break
    case 'add-performance':
      addPerformanceToShow.value = action.show
      break
    case 'delete-show':
      actions.deleteShow(action.show)
      break
    case 'edit-performance':
      performanceToEdit.value = action.performance
      break
    case 'performance-ticket-types':
      performanceForTicketTypes.value = action.performance
      performanceForTicketTypesLabel.value = action.label
      performanceForTicketTypesShowTitle.value = action.showTitle
      break
    case 'cancel-performance':
      actions.cancelPerformance(action.performance)
      break
    case 'reinstate-performance':
      actions.reinstatePerformance(action.performance, action.showStatus)
      break
    case 'delete-performance':
      actions.deletePerformance(action.performance)
      break
  }
}

const tabItems = computed(() => TABS.map(t => ({
  ...t,
  badge: t.value === 'active'
    ? activePage.value?.total
    : t.value === 'draft'
      ? draftPage.value?.total
      : (archiveLoaded ? archiveData.value?.total : undefined),
})))
</script>

<template>
  <AdminPage>
    <AdminTableToolbar>
      <template #left>
        <p class="text-muted">
          Manage productions and their scheduled performances
        </p>
      </template>
      <template #right>
        <ShowCreateModal @refresh="refreshAll" />
      </template>
    </AdminTableToolbar>

    <UTabs
      v-model="tab"
      :items="tabItems"
      :content="false"
      color="primary"
    />

    <!-- Now & next -->
    <template v-if="tab === 'active'">
      <AdminFetchError
        v-if="activeError"
        :error="activeError"
        title="Could not load current shows"
        :on-retry="refreshActive"
      />
      <AdminShowsTreeTable
        :rows="activeRows"
        :loading="activeStatus === 'pending'"
        expand-by-default
        empty-icon="i-lucide-calendar-check"
        empty-title="Nothing on and nothing coming up"
        empty-description="Published shows with a performance today or later appear here."
        @action="onRowAction"
      />
    </template>

    <!-- Drafts -->
    <template v-else-if="tab === 'draft'">
      <AdminFetchError
        v-if="draftError"
        :error="draftError"
        title="Could not load drafts"
        :on-retry="refreshDrafts"
      />
      <AdminShowsTreeTable
        :rows="draftRows"
        :loading="draftStatus === 'pending'"
        empty-icon="i-lucide-pencil-line"
        empty-title="No drafts"
        empty-description="Shows stay here until you publish them."
        @action="onRowAction"
      />
    </template>

    <!-- Archive -->
    <template v-else>
      <AdminShowsArchiveFilters
        v-model:search="archiveSearch"
        v-model:from="archiveFrom"
        v-model:to="archiveTo"
      />

      <AdminFetchError
        v-if="archiveError"
        :error="archiveError"
        title="Could not load the archive"
        :on-retry="refreshArchive"
      />

      <AdminShowsTreeTable
        :rows="archiveRows"
        :loading="archiveStatus === 'pending'"
        empty-icon="i-lucide-archive"
        :empty-title="archiveFiltered ? 'No shows match these filters' : 'Nothing in the archive yet'"
        :empty-description="archiveFiltered ? 'Try a different title, venue or date range.' : 'Shows move here once their run has finished.'"
        @action="onRowAction"
      />

      <AdminTablePagination
        v-model:page="archivePage"
        :total="archiveData?.total ?? 0"
        :limit="ARCHIVE_LIMIT"
        label="show"
        :suffix="archiveFiltered ? 'matching' : undefined"
      />
    </template>

    <!-- ── Modals ──────────────────────────────────────────────────────────
         Mounted at page level, where `refreshAll` lives. -->

    <ShowPerformanceTicketTypesModal
      :performance="performanceForTicketTypes"
      :performance-label="performanceForTicketTypesLabel"
      :show-title="performanceForTicketTypesShowTitle"
      @close="performanceForTicketTypes = null"
      @refresh="refreshAll"
    />

    <ShowPerformanceCreateModal
      :show-id="addPerformanceToShow?.id ?? null"
      :show-status="addPerformanceToShow?.status"
      @close="addPerformanceToShow = null"
      @refresh="() => { refreshAll(); addPerformanceToShow = null }"
    />

    <ShowPerformanceEditModal
      :performance="performanceToEdit"
      @close="performanceToEdit = null"
      @refresh="() => { refreshAll(); performanceToEdit = null }"
    />
  </AdminPage>
</template>
