<script setup lang="ts">
// Email sending (C-32, C-52, C-59) as one flow (Matt, 21 November 2026): the sending domain and
// whether it is verified, then one of two ways to set it (Cloudflare does it, or a domain already
// set up), each showing only what it needs, then the footer. Settings save as any page saves them.

interface Sender {
  domain: string | null
  verified: boolean
  contactSet: boolean
  automatic: { proposed: string | null, unavailable: 'no-token' | 'workers-dev' | 'local' | null }
}

const { t } = useT()
const { $api } = useNuxtApp()
const route = useRoute()
const { data: publicSettings } = usePublicSettings()
// The footer's preview draws the email's own frame: the theatre's name over a rule in the brand colour.
const theatreName = computed(() => (publicSettings.value?.['core.site.name']?.value as string | null | undefined) || t('core.email.your-theatre'))
const accent = computed(() => (publicSettings.value?.['core.brand.accent']?.value as string | undefined) ?? '#2563eb')
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const { data, status, error, refresh } = useAPI<Sender>('/api/core/notifications/sender')
const busy = ref<'set-up' | 'verify' | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const toast = useToast()

const UNAVAILABLE = {
  'workers-dev': t('core.email.unavailable.workers-dev'),
  'local': t('core.email.unavailable.local'),
  'no-token': t('core.email.unavailable.no-token'),
} as const

async function act(kind: 'set-up' | 'verify', body: Record<string, unknown> = {}) {
  refusal.value = null
  busy.value = kind
  try {
    const path = kind === 'set-up' ? '/api/core/notifications/set-up-domain' : '/api/core/notifications/verify-domain'
    const answer = await $api<{ domain: string }>(path, { method: 'POST', body })
    toast.add({
      color: 'success',
      icon: 'i-lucide-circle-check',
      title: kind === 'set-up' ? t('core.email.setting-up', { domain: answer.domain }) : t('core.email.test-went', { domain: answer.domain }),
      description: kind === 'set-up'
        ? t('core.email.setting-up-detail')
        : t('core.email.test-went-detail'),
    })
    await refresh()
    changing.value = false
  }
  catch (failure) {
    const view = toRefusal(failure)
    refusal.value = view
  }
  finally {
    busy.value = null
  }
}

// The two ways to give the site a sending domain; the page shows one at a time.
type Way = 'automatic' | 'own'
// A domain typed in by hand, or a site Cloudflare cannot set up, starts on the second way.
const startsOn = computed<Way>(() => {
  const sender = data.value
  if (!sender) return 'automatic'
  const cannot = sender.automatic.unavailable === 'local' || sender.automatic.unavailable === 'workers-dev'
  return cannot || (sender.domain && sender.domain !== sender.automatic.proposed) ? 'own' : 'automatic'
})
const picked = ref<Way | null>(null)
const way = computed<Way>({ get: () => picked.value ?? startsOn.value, set: (v) => { picked.value = v } })
const changing = ref(false)
const ways = [
  { label: t('core.email.way.automatic'), value: 'automatic' },
  { label: t('core.email.way.own'), value: 'own' },
]
const choosing = computed(() => !data.value?.verified || changing.value)
const highlight = computed(() => typeof route.query.setting === 'string' ? route.query.setting : undefined)
const KEYS = { domain: 'core.notifications.sending-domain', verified: 'core.notifications.verified-domain', footer: 'core.notifications.email-footer', label: 'core.notifications.sending-label' }
// Settings search lands on a setting: open the way that holds it.
watch(highlight, (key) => {
  if (key !== KEYS.domain && key !== KEYS.label) return
  way.value = key === KEYS.domain ? 'own' : 'automatic'
  changing.value = true
}, { immediate: true })

async function setUp() {
  const sender = data.value
  if (!sender?.automatic.proposed) return
  if (sender.domain && sender.domain !== sender.automatic.proposed) {
    const sure = await confirm({
      verb: t('core.email.replace'),
      thing: t('core.email.replace-thing', { domain: sender.domain }),
      consequence: t('core.email.replace-consequence', { domain: sender.automatic.proposed }),
      button: t('core.email.replace-button', { domain: sender.automatic.proposed }),
    })
    if (!sure) return
    return act('set-up', { replace: true })
  }
  return act('set-up')
}
</script>

<template>
  <PageFrame
    :title="t('core.email.email-sending')"
    width="reading"
    :description="t('core.email.description-where-the-theatres')"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      :skeleton-rows="3"
      @retry="refresh()"
    >
      <template v-if="data">
        <RefusalNotice :refusal="refusal" />

        <PageSection
          :title="t('core.email.sending-domain')"
          :description="data.domain ?? undefined"
        >
          <template #actions>
            <StatusBadge
              :tone="data.verified ? 'success' : data.domain ? 'warning' : 'neutral'"
              :label="data.verified ? t('core.email.state.verified') : data.domain ? t('core.email.state.unverified') : t('core.email.state.unset')"
            />
          </template>
          <p class="text-sm text-muted">
            {{ data.verified
              ? t('core.email.says.verified')
              : !data.domain
                ? t('core.email.says.unset')
                : data.contactSet
                  ? t('core.email.says.test')
                  : t('core.email.says.no-contact') }}
          </p>
          <UTabs
            v-if="choosing"
            v-model="way"
            :items="ways"
            :content="false"
            :aria-label="t('core.email.label-how-to-set')"
          />
          <template
            v-if="(data.domain && !data.verified) || !choosing"
            #footer
          >
            <UButton
              v-if="!choosing"
              :label="t('core.email.change-the-sending-domain')"
              color="neutral"
              variant="outline"
              @click="changing = true"
            />
            <UButton
              v-if="data.domain && !data.verified"
              :label="t('core.email.send-a-test-message')"
              color="neutral"
              variant="outline"
              :loading="busy === 'verify'"
              :disabled="!data.contactSet || busy !== null"
              @click="act('verify')"
            />
          </template>
        </PageSection>

        <template v-if="choosing && way === 'automatic'">
          <KeysCard
            v-if="data.automatic.unavailable === null || data.automatic.unavailable === 'no-token'"
            :names="['CORE_CLOUDFLARE_TOKEN']"
            @saved="refresh()"
          />
          <PageSection :title="t('core.email.set-up-automatically')">
            <p
              v-if="data.automatic.unavailable === null || data.automatic.unavailable === 'no-token'"
              class="text-sm text-muted"
            >
              {{ t('core.email.automatic-help', { domain: data.automatic.proposed ?? '' }) }}
            </p>
            <UAlert
              v-if="data.automatic.unavailable"
              color="info"
              icon="i-lucide-info"
              :description="UNAVAILABLE[data.automatic.unavailable]"
              :actions="data.automatic.unavailable === 'local' || data.automatic.unavailable === 'workers-dev'
                ? [{ label: t('core.email.site-address'), to: '/admin/theatre?setting=core.site.origin', color: 'neutral', variant: 'outline', trailingIcon: 'i-lucide-arrow-right' }]
                : undefined"
            />
            <template
              v-if="data.automatic.unavailable === null"
              #footer
            >
              <UButton
                :label="data.domain === data.automatic.proposed ? t('core.email.set-up-again', { domain: data.automatic.proposed }) : t('core.email.set-up', { domain: data.automatic.proposed })"
                icon="i-lucide-wand-sparkles"
                :loading="busy === 'set-up'"
                :disabled="busy !== null"
                @click="setUp()"
              />
            </template>
          </PageSection>
        </template>
      </template>
    </DataBoundary>
    <SettingsSections
      v-if="data && choosing && way === 'automatic' && (data.automatic.unavailable === null || data.automatic.unavailable === 'no-token')"
      screen="/admin/email"
      :heading="t('core.email.heading.label')"
      :omit="[KEYS.verified, KEYS.domain, KEYS.footer]"
      :highlight="highlight"
      @saved="refresh()"
    >
      <template #after-field>
        <UAlert
          v-if="data?.domain"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :description="t('core.email.label-note', { domain: data.domain })"
        />
      </template>
    </SettingsSections>
    <SettingsSections
      v-if="data && choosing && way === 'own'"
      screen="/admin/email"
      :heading="t('core.email.heading.own')"
      :omit="[KEYS.verified, KEYS.label, KEYS.footer]"
      :highlight="highlight"
      @saved="refresh()"
    />
    <SettingsSections
      screen="/admin/email"
      :heading="t('core.email.heading.footer')"
      :omit="[KEYS.verified, KEYS.domain, KEYS.label]"
      :highlight="highlight"
      @saved="refresh()"
    >
      <template #after-field="{ value }">
        <figure class="space-y-1">
          <figcaption class="text-sm text-muted">
            {{ t('core.email.preview-caption') }}
          </figcaption>
          <!-- Email is always white, whatever the screen's mode, so the preview is too: fixed colours, not tokens. -->
          <!-- eslint-disable better-tailwindcss/no-restricted-classes -->
          <div class="max-w-md rounded-md border border-default bg-white p-4 text-sm text-stone-900">
            <p
              class="mb-3 border-b-[3px] pb-2 font-semibold"
              :style="{ borderColor: accent }"
            >
              {{ theatreName }}
            </p>
            <p class="mb-3">
              {{ t('core.email.preview-body') }}
            </p>
            <p
              v-if="typeof value === 'string' && value.trim()"
              class="mt-4 text-xs whitespace-pre-line text-stone-600"
            >
              {{ value }}
            </p>
            <p
              v-else
              class="mt-4 text-xs text-stone-600 italic"
            >
              {{ t('core.email.preview-none') }}
            </p>
          </div>
        <!-- eslint-enable better-tailwindcss/no-restricted-classes -->
        </figure>
      </template>
    </SettingsSections>
  </PageFrame>
</template>
