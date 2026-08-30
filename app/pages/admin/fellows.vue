<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { awardFellowship, revokeFellowship } from '#shared/utils/admin-forms'
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'
import type { AwardFellowship } from '#shared/utils/admin-forms'

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

const toast = useToast()
const awardForm = useTemplateRef('awardForm')
const revokeForm = useTemplateRef('revokeForm')

const awarding = ref(false)
const award = reactive<Partial<AwardFellowship>>({})
const revoking = ref<Fellow | null>(null)
const revocation = reactive<{ reason?: string }>({})

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

// A refusal lands on the field it concerns rather than as an alert behind the modal (0032). The
// server knows which field only for the person, so anything else stays a page-level failure.
function blame(error: unknown, form: { setErrors: (errors: { name: string, message: string }[]) => void } | null, name: string): void {
  const message = refusalText(error)
  if (form && /already holds|not an account|has been erased|no such account/i.test(message)) {
    form.setErrors([{ name, message }])
    return
  }
  failure.value = message
}

async function record(event: FormSubmitEvent<AwardFellowship>): Promise<void> {
  failure.value = null
  try {
    await $fetch('/api/admin/fellowships', { method: 'POST', body: event.data })
    toast.add({ title: 'Recorded on the roll', icon: 'i-lucide-award', color: 'success' })
    awarding.value = false
    award.userId = undefined
    award.awardedOn = undefined
    award.awardedBy = undefined
    award.citation = undefined
    await load()
  }
  catch (error) {
    blame(error, awardForm.value ?? null, 'userId')
  }
}

async function revoke(event: FormSubmitEvent<{ reason: string }>): Promise<void> {
  if (!revoking.value) return
  failure.value = null
  try {
    await $fetch(`/api/admin/fellowships/${revoking.value.id}/revoke`, { method: 'POST', body: event.data })
    toast.add({
      title: 'Revoked',
      description: 'The award and everything taken under it still stand.',
      icon: 'i-lucide-ban',
    })
    revoking.value = null
    revocation.reason = undefined
    await load()
  }
  catch (error) {
    blame(error, revokeForm.value ?? null, 'reason')
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
        <UForm
          ref="awardForm"
          :schema="awardFellowship"
          :state="award"
          class="space-y-4"
          @submit="record"
        >
          <UFormField
            name="userId"
            label="Who is being honoured"
            description="They need an account to hold the entitlement."
            required
          >
            <PersonPicker
              v-model="award.userId"
              class="w-full"
            />
          </UFormField>
          <UFormField
            name="awardedOn"
            label="Date awarded"
            required
          >
            <DateField
              v-model="award.awardedOn"
              data-test="award-date"
              class="w-full"
            />
          </UFormField>
          <UFormField
            name="awardedBy"
            label="Resolved by"
            description="The meeting that resolved it, not a person."
            required
          >
            <UInput
              v-model="award.awardedBy"
              data-test="award-by"
              placeholder="Committee, 12 June 2019"
              class="w-full"
            />
          </UFormField>
          <UFormField
            name="citation"
            label="Citation"
            description="What it was awarded for, in the wording the theatre published."
            required
          >
            <UTextarea
              v-model="award.citation"
              data-test="award-citation"
              :rows="3"
              autoresize
              :maxrows="6"
              class="w-full"
            />
          </UFormField>
          <UButton
            type="submit"
            data-test="award-submit"
          >
            Record it
          </UButton>
        </UForm>
      </template>
    </UModal>

    <UModal
      :open="revoking !== null"
      title="Revoke this fellowship"
      description="The award, the date and the citation all stand. This adds a second fact, it does not correct the first."
      @update:open="revoking = null"
    >
      <template #body>
        <UForm
          ref="revokeForm"
          :schema="revokeFellowship"
          :state="revocation"
          class="space-y-4"
          @submit="revoke"
        >
          <UFormField
            name="reason"
            label="Reason"
            description="Kept on the record, and scrubbed if the person is later erased."
            required
          >
            <UTextarea
              v-model="revocation.reason"
              data-test="revoke-reason"
              :rows="3"
              autoresize
              :maxrows="6"
              class="w-full"
            />
          </UFormField>
          <UButton
            type="submit"
            color="error"
            data-test="revoke-submit"
          >
            Revoke
          </UButton>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
