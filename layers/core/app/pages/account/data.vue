<!-- Your data (ID-15, ID-16; identity spec part 6). Make a download of everything the theatre holds,
     ask for the account to be erased, see each request's progress, and cancel an erasure before it
     runs. Both requests need a fresh re-assertion, which `$api` asks for in place. A hold names what
     must be settled first in the words its module wrote for the person ("<code>.person"). Neither is
     offered until the theatre names its privacy contact. -->
<script setup lang="ts">
import type { RefusalView } from '../../utils/refusal'

type State = 'requested' | 'confirmed' | 'held' | 'running' | 'done' | 'cancelled' | 'failed'
interface Request {
  id: string
  kind: 'export' | 'erasure'
  state: State
  requestedAt: number
  notBefore: number | null
  holds: string[]
  finishedAt: number | null
  download?: { url: string, until: number | null }
}

const { t, te } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ available: boolean, requests: Request[] }>('/api/core/me/data-requests', { key: 'core:my-data-requests' })

const day = (ms: number) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(ms)
const refusal = ref<RefusalView | null>(null)
const asking = ref<'export' | 'erasure' | null>(null)

const TONE: Record<State, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  requested: 'warning', confirmed: 'info', held: 'warning', running: 'info', done: 'success', cancelled: 'neutral', failed: 'danger',
}
const OPEN: State[] = ['requested', 'confirmed', 'held', 'running']
const making = computed(() => data.value?.requests.some(r => r.kind === 'export' && r.state === 'running') ?? false)
const erasing = computed(() => data.value?.requests.some(r => r.kind === 'erasure' && OPEN.includes(r.state)) ?? false)
const holdText = (code: string) => te(`${code}.person`) ? t(`${code}.person`) : code

async function ask(kind: 'export' | 'erasure') {
  if (kind === 'erasure' && !await confirm({ verb: t('core.me.data.erase-verb'), thing: t('core.me.data.erase-thing'), consequence: t('core.me.data.erase-consequence'), button: t('core.me.data.erase-button') })) return
  asking.value = kind
  refusal.value = null
  try {
    await $api('/api/core/me/data-requests', { method: 'POST', body: { kind } })
    toast.add({ title: t(kind === 'export' ? 'core.me.data.download-asked' : 'core.me.data.erase-asked'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    asking.value = null
  }
}

async function cancel(request: Request) {
  if (!await confirm({ verb: t('core.me.data.cancel-verb'), thing: t('core.me.data.cancel-thing'), consequence: t('core.me.data.cancel-consequence') })) return
  refusal.value = null
  try {
    await $api(`/api/core/me/data-requests/${request.id}` as '/api/core/me/data-requests/:id', { method: 'DELETE', body: {} })
    toast.add({ title: t('core.me.data.cancelled'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <PageFrame
    :title="t('core.me.data.title')"
    :trail="[{ label: t('core.account.title'), to: '/account' }]"
    width="reading"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div
        v-if="data"
        class="space-y-6"
      >
        <UAlert
          v-if="!data.available"
          color="neutral"
          variant="subtle"
          icon="i-lucide-info"
          :title="t('core.me.data.unavailable')"
          :description="t('core.me.data.unavailable-detail')"
        />
        <RefusalNotice :refusal="refusal" />

        <template v-if="data.available">
          <PageSection
            :title="t('core.me.data.download')"
            :description="t('core.me.data.download-help')"
          >
            <UButton
              icon="i-lucide-download"
              :loading="asking === 'export' || making"
              :disabled="making"
              :label="t('core.me.data.make-download')"
              @click="ask('export')"
            />
          </PageSection>

          <PageSection
            :title="t('core.me.data.erase')"
            :description="t('core.me.data.erase-help')"
          >
            <UButton
              color="error"
              variant="outline"
              icon="i-lucide-user-x"
              :loading="asking === 'erasure'"
              :disabled="erasing"
              :label="t('core.me.data.erase-button')"
              @click="ask('erasure')"
            />
          </PageSection>
        </template>

        <PageSection
          v-if="data.requests.length"
          :title="t('core.me.data.requests')"
        >
          <RecordList :label="t('core.me.data.requests')">
            <RecordListItem
              v-for="r in data.requests"
              :key="r.id"
              :icon="r.kind === 'export' ? 'i-lucide-download' : 'i-lucide-user-x'"
              :name="t(`core.me.data.kind.${r.kind}`)"
              :muted="r.state === 'cancelled'"
            >
              <template #description>
                <span class="block">{{ t('core.me.data.asked', { date: day(r.requestedAt) }) }}</span>
                <span
                  v-if="r.notBefore && OPEN.includes(r.state)"
                  class="block"
                >{{ t('core.me.data.not-before', { date: day(r.notBefore) }) }}</span>
                <span
                  v-for="code in (r.state === 'held' ? r.holds : [])"
                  :key="code"
                  class="block text-warning"
                >{{ holdText(code) }}</span>
                <span
                  v-if="r.download?.until"
                  class="block"
                >{{ t('core.me.data.download-until', { date: day(r.download.until) }) }}</span>
                <span
                  v-else-if="r.kind === 'export' && r.state === 'done' && !r.download"
                  class="block"
                >{{ t('core.me.data.expired') }}</span>
              </template>
              <div class="flex flex-wrap items-center justify-end gap-2">
                <StatusBadge
                  :tone="TONE[r.state]"
                  :label="t(`core.me.data.state.${r.state}`)"
                />
                <UButton
                  v-if="r.download"
                  size="sm"
                  icon="i-lucide-download"
                  :to="r.download.url"
                  external
                  download
                  :label="t('core.me.data.download-ready')"
                />
                <UButton
                  v-if="r.kind === 'erasure' && ['requested', 'confirmed', 'held'].includes(r.state)"
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  :label="t('core.me.data.cancel')"
                  @click="cancel(r)"
                />
              </div>
            </RecordListItem>
          </RecordList>
        </PageSection>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
