<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'admin', title: 'Fellows', middleware: 'signed-in' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

interface Fellow {
  id: string
  userId: string
  name: string
  anonymised: boolean
  awardedOn: string
  awardedBy: string
  citation: string
  revokedAt: number | null
}

interface Listing {
  items: Fellow[]
  page: number
  pageSize: number
  total: number
  pages: number
}

const SHOW = [
  { label: 'Current Fellows', value: 'current' },
  { label: 'Revoked', value: 'revoked' },
  { label: 'Everyone ever', value: 'everyone' },
]

const listing = ref<Listing | null>(null)
const show = ref('current')
const search = ref('')
const page = ref(1)
const loading = ref(false)
const failure = ref<string | null>(null)

const awarding = ref(false)
const award = reactive({ userId: '', awardedOn: '', awardedBy: '', citation: '' })
const revoking = ref<Fellow | null>(null)
const reason = ref('')
const notice = ref<string | null>(null)

async function load(): Promise<void> {
  loading.value = true
  failure.value = null
  try {
    listing.value = await $fetch<Listing>('/api/admin/fellowships', {
      query: { show: show.value, search: search.value || undefined, page: page.value },
    })
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    loading.value = false
  }
}

async function record(): Promise<void> {
  failure.value = null
  try {
    await $fetch('/api/admin/fellowships', { method: 'POST', body: { ...award } })
    notice.value = 'The award is on the roll.'
    awarding.value = false
    award.userId = ''
    award.awardedOn = ''
    award.awardedBy = ''
    award.citation = ''
    await load()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
}

async function revoke(): Promise<void> {
  if (!revoking.value) return
  failure.value = null
  try {
    await $fetch(`/api/admin/fellowships/${revoking.value.id}/revoke`, { method: 'POST', body: { reason: reason.value } })
    notice.value = 'Revoked. The award and everything taken under it still stand.'
    revoking.value = null
    reason.value = ''
    await load()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
}

watch([show, search], () => {
  page.value = 1
  void load()
})
watch(page, load)

const columns: TableColumn<Fellow>[] = [
  { accessorKey: 'awardedOn', header: 'Awarded', meta: { class: { td: 'font-mono text-sm whitespace-nowrap' } } },
  {
    id: 'name',
    header: 'Fellow',
    cell: ({ row }) => h('div', { class: 'flex items-center gap-2' }, [
      row.original.name,
      row.original.anonymised ? h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => 'Erased') : null,
      row.original.revokedAt ? h(UBadge, { color: 'error', variant: 'subtle', size: 'sm' }, () => 'Revoked') : null,
    ]),
  },
  { accessorKey: 'awardedBy', header: 'Resolved by' },
  { accessorKey: 'citation', header: 'Citation', meta: { class: { td: 'text-sm text-muted' } } },
  {
    id: 'act',
    header: '',
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => h('div', { class: 'flex justify-end gap-1' }, [
      h(UButton, {
        'to': `/admin/people/${row.original.userId}`,
        'variant': 'ghost',
        'size': 'sm',
        'icon': 'i-lucide-user',
        'aria-label': `Open ${row.original.name}`,
      }),
      row.original.revokedAt
        ? null
        : h(UButton, {
            'variant': 'ghost',
            'size': 'sm',
            'color': 'error',
            'icon': 'i-lucide-ban',
            'data-test': 'revoke',
            'aria-label': `Revoke ${row.original.name}`,
            'onClick': () => { revoking.value = row.original },
          }),
    ]),
  },
]

onMounted(load)
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
      v-if="notice"
      data-test="fellows-notice"
      color="success"
      variant="subtle"
      :description="notice"
      close
      @update:open="notice = null"
    />

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-scroll"
      title="The roll is the theatre's own record"
      description="No database held it before this one, so the existing Fellows are entered here by hand. A revocation stops future admissions and rewrites nothing."
    />

    <div class="flex flex-wrap items-end gap-3">
      <UFormField
        label="Search"
        class="min-w-64 flex-1"
      >
        <UInput
          v-model="search"
          data-test="fellows-search"
          placeholder="A name, an address or a citation"
          icon="i-lucide-search"
        />
      </UFormField>

      <UFormField
        label="Show"
        class="min-w-48"
      >
        <USelect
          v-model="show"
          data-test="fellows-show"
          :items="SHOW"
          value-key="value"
        />
      </UFormField>

      <UButton
        data-test="award"
        icon="i-lucide-award"
        @click="awarding = true"
      >
        Record an award
      </UButton>
    </div>

    <UTable
      :data="listing?.items ?? []"
      :columns="columns"
      :loading="loading"
      data-test="fellows-table"
    />

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="fellows-total"
        class="text-sm text-muted"
      >
        {{ listing?.total ?? 0 }} Fellow(s)
      </p>
      <UPagination
        v-if="listing && listing.pages > 1"
        v-model:page="page"
        :total="listing.total"
        :items-per-page="listing.pageSize"
      />
    </div>

    <UModal
      v-model:open="awarding"
      title="Record a fellowship"
      description="One per person, for life. The citation is public wording and is shown as written."
    >
      <template #body>
        <form
          class="space-y-4"
          @submit.prevent="record"
        >
          <UFormField
            label="Account"
            description="The account id of the person being honoured. They need one to hold the entitlement."
          >
            <UInput
              v-model="award.userId"
              data-test="award-user"
              required
            />
          </UFormField>
          <UFormField label="Date awarded">
            <UInput
              v-model="award.awardedOn"
              data-test="award-date"
              type="date"
              required
            />
          </UFormField>
          <UFormField
            label="Resolved by"
            description="The meeting that resolved it, not a person."
          >
            <UInput
              v-model="award.awardedBy"
              data-test="award-by"
              placeholder="Committee, 12 June 2019"
              required
            />
          </UFormField>
          <UFormField
            label="Citation"
            description="What it was awarded for, in the wording the theatre published."
          >
            <UTextarea
              v-model="award.citation"
              data-test="award-citation"
              :rows="3"
              required
            />
          </UFormField>
          <UButton
            type="submit"
            data-test="award-submit"
          >
            Record it
          </UButton>
        </form>
      </template>
    </UModal>

    <UModal
      :open="revoking !== null"
      title="Revoke this fellowship"
      description="The award, the date and the citation all stand. This adds a second fact, it does not correct the first."
      @update:open="revoking = null"
    >
      <template #body>
        <form
          class="space-y-4"
          @submit.prevent="revoke"
        >
          <UFormField
            label="Reason"
            description="Kept on the record, and scrubbed if the person is later erased."
          >
            <UTextarea
              v-model="reason"
              data-test="revoke-reason"
              :rows="3"
              required
            />
          </UFormField>
          <UButton
            type="submit"
            color="error"
            data-test="revoke-submit"
          >
            Revoke
          </UButton>
        </form>
      </template>
    </UModal>
  </div>
</template>
