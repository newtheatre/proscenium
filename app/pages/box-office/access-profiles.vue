<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { ACCESS_FLAGS, ACCESS_FLAG_LABELS, saysAccessProfileStatus, verifyAccessProfileForm } from '#shared/utils/access-profiles'
import { accessProfilesList } from '#shared/utils/access-profiles-list'
import type { AccessProfileStatus, OfficerAccessProfile } from '#shared/utils/access-profiles'
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Access profiles', middleware: 'console', docs: '/docs/box-office/access-profiles' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

interface Summary {
  userId: string
  name: string
  email: string
  status: AccessProfileStatus
  companions: number
  createdAt: number
  updatedAt: number
}

interface Listing { items: Summary[], page: number, pageSize: number, total: number, pages: number }

const STATUS_COLOURS: Record<AccessProfileStatus, 'neutral' | 'success' | 'error' | 'warning'> = {
  PENDING: 'warning',
  VERIFIED: 'success',
  EXPIRED: 'neutral',
  DECLINED: 'error',
  WITHDRAWN: 'neutral',
}

const request = useRequestFetch()
const failure = ref<string | null>(null)
const toast = useToast()

const empty = (): Listing => ({ items: [], page: 1, pageSize: 0, total: 0, pages: 1 })

// Search, the status filter, sort and page live in the URL (K-129); pending is the hidden
// default, the same shape the register gives "current".
const { search, conditions, sort, page, query, active, set, setSort, clear } = useListQuery(accessProfilesList)

const { data: listing, status: fetchStatus, error, refresh } = await useAsyncData(
  'access-profiles',
  () => request<Listing>('/api/admin/access-profiles', { query: query.value }),
  { watch: [query], default: empty },
)

const loading = computed(() => fetchStatus.value === 'pending')
const listingFailure = computed(() => (error.value ? refusalText(error.value, 'The declarations could not be read.') : null))

async function load(): Promise<void> {
  await refresh()
}

const reviewing = ref<Summary | null>(null)
const detail = ref<OfficerAccessProfile | null>(null)
const detailLoading = ref(false)
const deciding = ref(false)
const decideState = reactive({ fohNote: '' })

async function review(row: Summary): Promise<void> {
  reviewing.value = row
  detail.value = null
  decideState.fohNote = ''
  detailLoading.value = true
  try {
    const { profile } = await $fetch<{ profile: OfficerAccessProfile }>(`/api/admin/access-profiles/${row.userId}`)
    detail.value = profile
    decideState.fohNote = profile.fohNote ?? ''
  }
  catch (error) {
    failure.value = refusalText(error)
    reviewing.value = null
  }
  finally {
    detailLoading.value = false
  }
}

async function verify(event: FormSubmitEvent<{ fohNote: string }>): Promise<void> {
  if (!reviewing.value) return
  deciding.value = true
  try {
    await $fetch(`/api/admin/access-profiles/${reviewing.value.userId}/verify`, { method: 'POST', body: event.data })
    toast.add({ title: `${reviewing.value.name}'s access profile verified`, icon: 'i-lucide-check', color: 'success' })
    reviewing.value = null
    await load()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    deciding.value = false
  }
}

// The route takes no reason, so the confirmation carries no field: it states what declining does
// and asks for the word (K-123 criterion 7).
const declining = ref(false)
const declineFailure = ref<string | null>(null)

async function decline(): Promise<void> {
  if (!reviewing.value) return
  deciding.value = true
  declineFailure.value = null
  try {
    await $fetch(`/api/admin/access-profiles/${reviewing.value.userId}/decline`, { method: 'POST' })
    toast.add({ title: `${reviewing.value.name}'s access profile declined`, icon: 'i-lucide-x', color: 'neutral' })
    declining.value = false
    reviewing.value = null
    await load()
  }
  catch (error) {
    declineFailure.value = refusalText(error)
  }
  finally {
    deciding.value = false
  }
}

const givenFlags = computed(() => ACCESS_FLAGS.filter(flag => detail.value?.flags[flag]))

const columns: TableColumn<Summary>[] = [
  {
    id: 'name',
    header: 'Patron',
    cell: ({ row }) => h('div', {}, [
      h('div', {}, row.original.name),
      h('div', { class: 'font-mono text-xs text-muted' }, row.original.email),
      // Below sm the companion count is hidden: shown here instead, so a phone keeps the status
      // and the row's action in view without losing what it said (issue 922).
      h('div', { class: 'sm:hidden text-xs text-muted' }, plural(row.original.companions, 'companion')),
    ]),
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => h(UBadge, { color: STATUS_COLOURS[row.original.status], variant: 'subtle', size: 'sm' }, () => saysAccessProfileStatus(row.original.status)),
  },
  { accessorKey: 'companions', header: 'Companions', meta: { class: { th: HIDE_BELOW_SM, td: HIDE_BELOW_SM } } },
  {
    id: 'open',
    header: ACTIONS_HEADER,
    meta: { class: { td: 'text-right' } },
    cell: ({ row }) => h(UButton, {
      'variant': 'subtle',
      'size': 'sm',
      'data-test': 'review',
      'onClick': () => review(row.original),
    }, () => 'Review'),
  },
]

// A page alert renders behind an open modal's overlay, where nobody can read it, so a refusal
// is shown wherever the action was taken.
const modalOpen = computed(() => reviewing.value !== null || declining.value)

watch(modalOpen, (nowOpen) => {
  if (!nowOpen) failure.value = null
})
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
      v-if="failure && !modalOpen"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <p class="text-sm text-muted">
      Declarations waiting to be sighted, and the wording the door reads out.
    </p>

    <AdminToolbar
      v-model:search="search"
      :placeholder="accessProfilesList.search?.placeholder"
      :active="active"
      :loading="loading"
      @clear="clear"
    >
      <template #filters>
        <ConsoleFilters
          :spec="accessProfilesList"
          :conditions="conditions"
          :sort="sort"
          @set="set"
          @sort="setSort"
        />
      </template>
    </AdminToolbar>

    <UTable
      :data="listing.items"
      :columns="columns"
      :loading="loading"
      data-test="access-profiles-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          No declarations to review.
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="access-profiles-total"
        class="text-sm text-muted"
      >
        {{ plural(listing.total, 'declaration') }}
      </p>
      <UPagination
        v-if="listing.pages > 1"
        v-model:page="page"
        :total="listing.total"
        :items-per-page="listing.pageSize"
      />
    </div>

    <UModal
      :open="reviewing !== null"
      title="Access profile"
      description="Sight the evidence, then agree the wording the door will read out. Everything else here stays off every other screen."
      @update:open="value => { if (!value) reviewing = null }"
    >
      <template #body>
        <UAlert
          v-if="failure"
          data-test="failure"
          class="mb-4"
          color="error"
          variant="subtle"
          :description="failure"
        />
        <div
          v-if="detailLoading || !detail"
          class="flex items-center gap-3 text-muted"
        >
          <UIcon
            name="i-lucide-loader-circle"
            class="animate-spin"
          />
          <span>Reading the declaration.</span>
        </div>

        <div
          v-else
          class="space-y-4"
        >
          <div>
            <p class="font-medium">
              {{ reviewing?.name }}
            </p>
            <p class="text-sm text-muted">
              {{ reviewing?.email }}
            </p>
          </div>

          <div v-if="detail.accessCardNumber">
            <p class="text-sm font-medium">
              Access Card number given
            </p>
            <p class="font-mono text-sm">
              {{ detail.accessCardNumber }}
            </p>
            <p class="text-xs text-muted">
              Sight the card, then decide: the number is cleared the moment you do, either way.
            </p>
          </div>

          <div>
            <p class="text-sm font-medium">
              Needs
            </p>
            <ul
              v-if="givenFlags.length"
              class="list-disc pl-5 text-sm"
            >
              <li
                v-for="flag in givenFlags"
                :key="flag"
              >
                {{ ACCESS_FLAG_LABELS[flag] }}
              </li>
            </ul>
            <p
              v-else
              class="text-sm text-muted"
            >
              None of the listed categories.
            </p>
          </div>

          <p class="text-sm">
            Companions: <span class="font-medium">{{ detail.companions }}</span>
          </p>

          <div v-if="detail.requesterNote">
            <p class="text-sm font-medium">
              In their own words
            </p>
            <p class="text-sm text-muted">
              {{ detail.requesterNote }}
            </p>
          </div>

          <UForm
            :schema="verifyAccessProfileForm"
            :state="decideState"
            class="space-y-3"
            @submit="verify"
          >
            <UFormField
              label="Agreed wording for the door"
              name="fohNote"
              description="Operational only, for example 'aisle seat, assistance dog'. Never a need, a diagnosis or their own words."
            >
              <UTextarea
                v-model="decideState.fohNote"
                class="w-full"
                data-test="foh-note"
              />
            </UFormField>

            <div class="flex justify-end gap-2">
              <UButton
                variant="subtle"
                color="error"
                data-test="decline"
                @click="declineFailure = null; declining = true"
              >
                Decline
              </UButton>
              <UButton
                type="submit"
                :loading="deciding"
                data-test="verify"
              >
                Verify
              </UButton>
            </div>
          </UForm>
        </div>
      </template>
    </UModal>

    <ConfirmModal
      v-model:open="declining"
      name="decline-declaration"
      :title="reviewing ? `Decline ${reviewing.name}'s declaration` : ''"
      verb="Decline the declaration"
      consequence="The Access Card number is cleared and the door is given no wording for them. They may declare again."
      :loading="deciding"
      :failure="declineFailure"
      @confirm="decline"
    />
  </div>
</template>
