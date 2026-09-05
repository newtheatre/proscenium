<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { ACCESS_FLAGS, ACCESS_FLAG_LABELS, ACCESS_PROFILE_STATUSES, verifyAccessProfileForm } from '#shared/utils/access-profiles'
import type { AccessProfileStatus, OfficerAccessProfile } from '#shared/utils/access-profiles'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Access profiles', middleware: 'console' })

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

const listing = ref<Listing | null>(null)
const status = ref<AccessProfileStatus | 'ALL'>('PENDING')
const search = ref('')
const page = ref(1)
const loading = ref(false)
const failure = ref<string | null>(null)
const toast = useToast()

async function load(): Promise<void> {
  loading.value = true
  failure.value = null
  try {
    listing.value = await $fetch<Listing>('/api/admin/access-profiles', {
      query: { status: status.value === 'ALL' ? undefined : status.value, search: search.value.trim() || undefined, page: page.value },
    })
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    loading.value = false
  }
}

function sentenceCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase()
}

const activeFilters = computed<ActiveFilter[]>(() => {
  const active: ActiveFilter[] = []
  if (status.value !== 'PENDING') {
    active.push({ key: 'status', label: sentenceCase(status.value), icon: 'i-lucide-list-filter', clear: () => {
      status.value = 'PENDING'
    } })
  }
  return active
})

function clearFilters(): void {
  status.value = 'PENDING'
}

watch([status, search], () => {
  page.value = 1
  void load()
})
watch(page, load)
onMounted(load)

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

async function decline(): Promise<void> {
  if (!reviewing.value) return
  deciding.value = true
  try {
    await $fetch(`/api/admin/access-profiles/${reviewing.value.userId}/decline`, { method: 'POST' })
    toast.add({ title: `${reviewing.value.name}'s access profile declined`, icon: 'i-lucide-x', color: 'neutral' })
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

const givenFlags = computed(() => ACCESS_FLAGS.filter(flag => detail.value?.flags[flag]))

const columns: TableColumn<Summary>[] = [
  {
    id: 'name',
    header: 'Patron',
    cell: ({ row }) => h('div', {}, [
      h('div', {}, row.original.name),
      h('div', { class: 'font-mono text-xs text-muted' }, row.original.email),
    ]),
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => h(UBadge, { color: STATUS_COLOURS[row.original.status], variant: 'subtle', size: 'sm' }, () => sentenceCase(row.original.status)),
  },
  { accessorKey: 'companions', header: 'Companions' },
  {
    id: 'open',
    header: '',
    meta: { class: { td: 'text-right' } },
    cell: ({ row }) => h(UButton, {
      'variant': 'subtle',
      'size': 'sm',
      'data-test': 'review',
      'onClick': () => review(row.original),
    }, () => 'Review'),
  },
]
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="failure"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-shield"
      title="Special category data"
      description="What is declared here is encrypted at rest and never leaves this screen: the door sees agreed wording only, once a profile is verified and the patron has consented."
    />

    <AdminToolbar
      v-model:search="search"
      placeholder="A name or an address"
      :active="activeFilters"
      :loading="loading"
      @clear="clearFilters"
    >
      <template #filters>
        <UFormField label="Show">
          <USelect
            v-model="status"
            data-test="access-profiles-filter"
            :items="[{ label: 'Everyone', value: 'ALL' }, ...ACCESS_PROFILE_STATUSES.map(value => ({ label: sentenceCase(value), value }))]"
            value-key="value"
            class="w-full"
          />
        </UFormField>
      </template>
    </AdminToolbar>

    <UTable
      :data="listing?.items ?? []"
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

    <UModal
      :open="reviewing !== null"
      title="Access profile"
      description="Sight the evidence, then agree the wording the door will read out. Everything else here stays off every other screen."
      @update:open="value => { if (!value) reviewing = null }"
    >
      <template #body>
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
                :loading="deciding"
                data-test="decline"
                @click="decline"
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
  </div>
</template>
