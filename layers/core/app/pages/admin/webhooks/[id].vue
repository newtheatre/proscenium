<!-- One webhook (C-49 to C-51): its name, address, format and events; the signing secret, shown once
     when it is made; sending a test, pausing and resuming, a new secret, deleting; and the delivery
     log, where a failed delivery can be tried again. `new` adds one. -->
<script setup lang="ts">
import { webhookInput, webhookPatch } from '../../../../server/webhooks/inputs'
import type { Webhook, WebhookDelivery } from '../../../../server/webhooks/service'

interface DeliverableEvent { name: string, module: string, version: number }
interface TestResult { ok: boolean, status: number | null, error: string | null }

const { t, te } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const { brief } = useDates()
const toast = useToast()
const undo = useUndo()
const route = useRoute()
const id = computed(() => String(route.params.id))
const isNew = computed(() => id.value === 'new')
const { data, status, error, refresh } = await useAPI<{ webhooks: Webhook[], events: DeliverableEvent[] }>('/api/core/webhooks', { key: 'core:webhooks' })
const hook = computed(() => data.value?.webhooks.find(w => w.id === id.value))

// The secret is shown once: after the webhook is added, its secret made anew, or its format moved to
// JSON. It is kept only until the page is left, or until the person says they have kept it.
const shown = useState<{ id: string, secret: string } | null>('core:webhook-secret', () => null)
const secret = computed(() => shown.value?.id === id.value ? shown.value.secret : null)
onBeforeRouteLeave((to) => {
  if (to.path !== `/admin/webhooks/${shown.value?.id}`) shown.value = null
})
const copied = ref(false)
async function copySecret() {
  if (!secret.value) return
  await navigator.clipboard.writeText(secret.value)
  copied.value = true
}

const form = reactive({ name: '', url: '', format: 'json' as Webhook['format'], events: [] as string[] })
watch(hook, (h) => {
  if (h) Object.assign(form, { name: h.name, url: '', format: h.format, events: [...h.events] })
}, { immediate: true })

const formats = computed(() => (['json', 'discord', 'slack'] as const).map(value => ({ value, label: t(`core.webhooks.format.${value}`) })))
const moduleName = (m: string) => te(`${m}.module.name`) ? t(`${m}.module.name`) : m
const groups = computed(() => {
  const by = new Map<string, DeliverableEvent[]>()
  for (const e of data.value?.events ?? []) by.set(e.module, [...(by.get(e.module) ?? []), e])
  return [...by].map(([module, events]) => ({ module, name: moduleName(module), events })).sort((a, b) => a.name.localeCompare(b.name))
})
// An event in words ("Night report signed off"); its exact name stays beneath for whoever wires the receiver.
function eventWords(e: DeliverableEvent): string {
  const words = e.name.slice(e.module.length + 1).replace(/[.-]/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
const has = (name: string) => form.events.includes(name)
function choose(name: string, on: boolean | 'indeterminate') {
  form.events = on === true ? [...new Set([...form.events, name])] : form.events.filter(e => e !== name)
}
function chooseModule(module: string, on: boolean | 'indeterminate') {
  // Everything from a module stands for each of its events, so they are not listed twice.
  const rest = form.events.filter(e => !e.startsWith(`${module}.`))
  form.events = on === true ? [...rest, `${module}.*`] : rest
}

const body = computed(() => isNew.value
  ? { name: form.name, url: form.url, format: form.format, events: form.events }
  : { name: form.name, format: form.format, events: form.events, ...(form.url.trim() ? { url: form.url } : {}) })
const title = computed(() => isNew.value ? t('core.webhooks.new') : (hook.value?.name ?? t('core.webhooks.webhook')))
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref<string | null>(null)

async function act<T>(name: string, run: () => Promise<T>): Promise<T | undefined> {
  refusal.value = null
  busy.value = name
  try {
    return await run()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = null
  }
}

async function save() {
  await act('save', async () => {
    if (isNew.value) {
      const made = await $api<{ id: string, secret: string | null }>('/api/core/webhooks', { method: 'POST', body: body.value })
      if (made.secret) shown.value = { id: made.id, secret: made.secret }
      toast.add({ title: t('core.webhooks.created', { name: form.name }), color: 'success' })
      await refresh()
      await navigateTo(`/admin/webhooks/${made.id}`, { replace: true })
      return
    }
    const changed = await $api<{ secret: string | null }>(`/api/core/webhooks/${id.value}` as '/api/core/webhooks/:id', { method: 'PATCH', body: body.value })
    if (changed.secret) shown.value = { id: id.value, secret: changed.secret }
    toast.add({ title: t('core.webhooks.saved'), color: 'success' })
    await refresh()
  })
}

async function sendTest() {
  const result = await act('test', () => $api<TestResult>(`/api/core/webhooks/${id.value}/test` as '/api/core/webhooks/:id/test', { method: 'POST', body: {} }))
  if (!result) return
  if (result.ok) toast.add({ title: t('core.webhooks.test-ok', { status: result.status ?? '' }), color: 'success' })
  else toast.add({ title: t('core.webhooks.test-failed'), description: result.error && result.error !== 'status' ? t(`core.webhooks.test-${result.error}`) : t('core.webhooks.test-status', { status: result.status ?? '' }), color: 'error' })
}

async function setPaused(paused: boolean) {
  if (!hook.value) return
  const name = hook.value.name
  const done = await act('state', () => $api(`/api/core/webhooks/${id.value}/state` as '/api/core/webhooks/:id/state', { method: 'POST', body: { paused } }).then(() => true))
  if (!done) return
  // Pausing and resuming undo each other, so the toast offers the other.
  undo.offer(t(paused ? 'core.webhooks.paused-toast' : 'core.webhooks.resumed-toast', { name }), () => setPaused(!paused))
  await Promise.all([refresh(), refreshLog()])
}

async function rotate() {
  if (!hook.value || !await confirm({ verb: t('core.webhooks.rotate'), thing: hook.value.name, consequence: t('core.webhooks.rotate-consequence'), button: t('core.webhooks.rotate') })) return
  const made = await act('rotate', () => $api<{ secret: string }>(`/api/core/webhooks/${id.value}/rotate` as '/api/core/webhooks/:id/rotate', { method: 'POST', body: {} }))
  if (made) {
    shown.value = { id: id.value, secret: made.secret }
    copied.value = false
  }
}

async function remove() {
  if (!hook.value) return
  const name = hook.value.name
  if (!await confirm({ verb: t('core.webhooks.delete'), thing: name, consequence: t('core.webhooks.delete-consequence'), button: t('core.webhooks.delete') })) return
  const done = await act('delete', () => $api(`/api/core/webhooks/${id.value}` as '/api/core/webhooks/:id', { method: 'DELETE', body: {} }).then(() => true))
  if (!done) return
  toast.add({ title: t('core.webhooks.deleted', { name }), color: 'success' })
  await refresh()
  await navigateTo('/admin/webhooks')
}

// The delivery log, a page at a time.
const page = ref(1)
const PAGE_SIZE = 50 // not-policy: a page of the log
const { data: log, refresh: refreshLog } = await useAPI<{ rows: WebhookDelivery[], total: number }>(() => `/api/core/webhooks/${id.value}/deliveries`, {
  key: computed(() => `core:webhook-log:${id.value}:${page.value}`),
  query: computed(() => ({ page: page.value, size: PAGE_SIZE })),
  immediate: !isNew.value,
  watch: [id, page],
})
const deliveryTone = { queued: 'info', sending: 'info', sent: 'success', retrying: 'warning', failed: 'danger' } as const
const columns = computed(() => [
  { accessorKey: 'createdAt', header: t('core.webhooks.log-when') },
  { accessorKey: 'eventName', header: t('core.webhooks.log-event') },
  { accessorKey: 'state', header: t('core.webhooks.log-state') },
  { accessorKey: 'attempts', header: t('core.webhooks.log-tries') },
  { id: 'answer', header: t('core.webhooks.log-answer') },
  { id: 'actions' },
])
function answer(d: WebhookDelivery): string {
  if (d.lastError && d.lastError !== 'status') return t(`core.webhooks.error.${d.lastError}`)
  return d.responseStatus ? String(d.responseStatus) : t('core.webhooks.log-no-answer')
}
async function retry(d: WebhookDelivery) {
  const done = await act(`retry:${d.id}`, () => $api(`/api/core/webhooks/${id.value}/deliveries/${d.id}/retry` as '/api/core/webhooks/:id/deliveries/:delivery/retry', { method: 'POST', body: {} }).then(() => true))
  if (!done) return
  toast.add({ title: t('core.webhooks.retried'), color: 'success' })
  await refreshLog()
}
</script>

<template>
  <PageFrame
    :title="title"
    :trail="[{ label: t('core.webhooks.title'), to: '/admin/webhooks' }]"
    width="reading"
  >
    <template #status>
      <StatusBadge
        v-if="hook"
        :tone="hook.state === 'active' ? 'success' : hook.state === 'failing' ? 'danger' : 'neutral'"
        :label="t(`core.webhooks.state.${hook.state}`)"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!isNew && !hook"
        icon="i-lucide-webhook"
        :title="t('core.webhooks.missing')"
      />
      <div
        v-else
        class="space-y-6"
      >
        <RefusalNotice :refusal="refusal" />

        <PageSection
          v-if="secret"
          :title="t('core.webhooks.secret-title')"
          :description="t('core.webhooks.secret-help')"
        >
          <UFieldGroup class="w-full">
            <UInput
              :model-value="secret"
              readonly
              class="font-mono"
              :aria-label="t('core.webhooks.secret-title')"
            />
            <UButton
              color="neutral"
              variant="outline"
              :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
              :label="copied ? t('core.webhooks.copied') : t('core.webhooks.copy')"
              @click="copySecret()"
            />
          </UFieldGroup>
          <UButton
            color="neutral"
            variant="link"
            :label="t('core.webhooks.done-secret')"
            @click="shown = null"
          />
        </PageSection>

        <UAlert
          v-if="hook?.state === 'failing'"
          color="error"
          variant="subtle"
          icon="i-lucide-octagon-alert"
          :description="t('core.webhooks.failing-alert', { count: hook.consecutiveFailures })"
        />
        <UAlert
          v-else-if="hook?.state === 'paused'"
          color="neutral"
          variant="subtle"
          icon="i-lucide-pause"
          :description="t('core.webhooks.paused-alert')"
        />

        <UForm
          :schema="isNew ? webhookInput : webhookPatch"
          :state="body"
          class="space-y-6"
          novalidate
          @submit="save"
        >
          <PageSection :title="t('core.webhooks.about')">
            <UFormField
              name="name"
              :label="t('core.webhooks.name')"
              :help="t('core.webhooks.name-help')"
              required
            >
              <UInput
                v-model="form.name"
                maxlength="60"
              />
            </UFormField>
            <UFormField
              name="url"
              :label="t('core.webhooks.url')"
              :help="hook ? t('core.webhooks.url-keep', { host: hook.host }) : t('core.webhooks.url-help')"
              :required="isNew"
            >
              <UInput
                v-model="form.url"
                type="url"
                inputmode="url"
                autocomplete="off"
                placeholder="https://"
              />
            </UFormField>
            <UFormField
              name="format"
              :label="t('core.webhooks.format')"
              :help="t('core.webhooks.format-help')"
            >
              <USelect
                v-model="form.format"
                :items="formats"
                value-key="value"
                class="w-56"
              />
            </UFormField>
          </PageSection>

          <PageSection
            :title="t('core.webhooks.events')"
            :description="t('core.webhooks.events-help')"
          >
            <UFormField name="events">
              <div class="space-y-5">
                <fieldset
                  v-for="group in groups"
                  :key="group.module"
                  class="space-y-2"
                >
                  <legend class="mb-2 font-medium text-highlighted">
                    {{ group.name }}
                  </legend>
                  <!-- Each checkbox names its own id: inside a form field they would all share the field's. -->
                  <UCheckbox
                    :id="`webhook-event-${group.module}`"
                    :model-value="has(`${group.module}.*`)"
                    :label="t('core.webhooks.everything-from', { module: group.name })"
                    @update:model-value="chooseModule(group.module, $event)"
                  />
                  <div
                    v-if="!has(`${group.module}.*`)"
                    class="grid gap-2 ps-6 sm:grid-cols-2"
                  >
                    <UCheckbox
                      v-for="e in group.events"
                      :id="`webhook-event-${e.name}`"
                      :key="e.name"
                      :model-value="has(e.name)"
                      :label="eventWords(e)"
                      :description="e.name"
                      :ui="{ description: 'font-mono text-xs break-all' }"
                      @update:model-value="choose(e.name, $event)"
                    />
                  </div>
                </fieldset>
              </div>
            </UFormField>
          </PageSection>

          <UButton
            type="submit"
            :label="isNew ? t('core.webhooks.new') : t('core.webhooks.save')"
            :loading="busy === 'save'"
          />
        </UForm>

        <PageSection
          v-if="hook"
          :title="t('core.webhooks.actions')"
        >
          <div class="flex flex-wrap gap-2">
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-send"
              :label="t('core.webhooks.test')"
              :loading="busy === 'test'"
              @click="sendTest()"
            />
            <UButton
              color="neutral"
              variant="outline"
              :icon="hook.state === 'active' ? 'i-lucide-pause' : 'i-lucide-play'"
              :label="hook.state === 'active' ? t('core.webhooks.pause') : t('core.webhooks.resume')"
              :loading="busy === 'state'"
              @click="setPaused(hook.state === 'active')"
            />
            <UButton
              v-if="hook.format === 'json'"
              color="neutral"
              variant="outline"
              icon="i-lucide-key-round"
              :label="t('core.webhooks.rotate')"
              :loading="busy === 'rotate'"
              @click="rotate()"
            />
            <UButton
              color="error"
              variant="outline"
              icon="i-lucide-trash-2"
              :label="t('core.webhooks.delete')"
              :loading="busy === 'delete'"
              @click="remove()"
            />
          </div>
        </PageSection>

        <PageSection
          v-if="hook"
          :title="t('core.webhooks.log')"
          :description="t('core.webhooks.log-help')"
        >
          <p
            v-if="!log?.rows.length"
            class="text-sm text-muted"
          >
            {{ t('core.webhooks.log-empty') }}
          </p>
          <template v-else>
            <UTable
              :data="log.rows"
              :columns="columns"
              :caption="t('core.webhooks.log')"
            >
              <template #createdAt-cell="{ row }">
                {{ brief(row.original.createdAt) }}
              </template>
              <template #eventName-cell="{ row }">
                <span class="font-mono text-xs">{{ row.original.eventName }}</span>
              </template>
              <template #state-cell="{ row }">
                <StatusBadge
                  :tone="deliveryTone[row.original.state]"
                  :label="t(`core.webhooks.delivery.${row.original.state}`)"
                />
                <p
                  v-if="row.original.state === 'retrying' && row.original.nextAttemptAt"
                  class="mt-1 text-xs text-muted"
                >
                  {{ t('core.webhooks.log-next', { when: brief(row.original.nextAttemptAt) }) }}
                </p>
              </template>
              <template #answer-cell="{ row }">
                {{ answer(row.original) }}
              </template>
              <template #actions-cell="{ row }">
                <UButton
                  v-if="row.original.state === 'failed'"
                  size="sm"
                  color="neutral"
                  variant="outline"
                  :label="t('core.webhooks.retry')"
                  :loading="busy === `retry:${row.original.id}`"
                  @click="retry(row.original)"
                />
              </template>
            </UTable>
            <UPagination
              v-if="log.total > PAGE_SIZE"
              v-model:page="page"
              :total="log.total"
              :items-per-page="PAGE_SIZE"
            />
          </template>
        </PageSection>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
