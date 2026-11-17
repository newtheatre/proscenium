<script setup lang="ts">
// Email sending (C-32, C-52, C-59): the sending domain, whether it is verified, a test message,
// where the site has its own domain and a Cloudflare token is set, setting the domain up for you,
// and the email settings, saved as any page of settings saves them. The verified domain is the
// status above, so it is not drawn again among them.

interface Sender {
  domain: string | null
  verified: boolean
  contactSet: boolean
  automatic: { proposed: string | null, unavailable: 'no-token' | 'workers-dev' | 'local' | null }
}

const { $api } = useNuxtApp()
const route = useRoute()
const { data: publicSettings } = usePublicSettings()
// The footer's preview draws the email's own frame: the theatre's name over a rule in the brand colour.
const theatreName = computed(() => (publicSettings.value?.['core.site.name']?.value as string | null | undefined) || 'Your theatre')
const accent = computed(() => (publicSettings.value?.['core.brand.accent']?.value as string | undefined) ?? '#2563eb')
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const { data, status, error, refresh } = useAPI<Sender>('/api/core/notifications/sender')
const busy = ref<'set-up' | 'verify' | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const toast = useToast()

const UNAVAILABLE = {
  'workers-dev': 'This site is on workers.dev, which cannot send email from its own address. Add a custom domain to the Worker and open the site there to set email up automatically.',
  'local': 'This site has no public domain yet, so email cannot be set up automatically here.',
  'no-token': 'To set this up automatically, set the CORE_CLOUDFLARE_TOKEN secret on the Worker with Email Sending edit and Zone read. You can also onboard a domain in the Cloudflare dashboard and enter it below.',
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
      title: kind === 'set-up' ? `Cloudflare is setting up ${answer.domain}` : `A test message went from ${answer.domain}`,
      description: kind === 'set-up'
        ? 'A test message goes to the contact address in a few minutes, once Cloudflare accepts it.'
        : 'It went to the contact address. Email can now be sent.',
    })
    await refresh()
  }
  catch (failure) {
    const view = toRefusal(failure)
    refusal.value = view
  }
  finally {
    busy.value = null
  }
}

async function setUp() {
  const sender = data.value
  if (!sender?.automatic.proposed) return
  if (sender.domain && sender.domain !== sender.automatic.proposed) {
    const sure = await confirm({
      verb: 'Replace',
      thing: `the sending domain ${sender.domain}`,
      consequence: `Email will come from ${sender.automatic.proposed} instead, once Cloudflare has set it up and a test message has passed.`,
      button: `Send from ${sender.automatic.proposed}`,
    })
    if (!sure) return
    return act('set-up', { replace: true })
  }
  return act('set-up')
}
</script>

<template>
  <PageFrame
    title="Email sending"
    width="reading"
    description="Where the theatre's email comes from. Nothing is sent, including sign-in links, until the sending domain is verified."
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
          title="Sending domain"
          :description="data.domain ?? 'Not set'"
        >
          <template #actions>
            <StatusBadge
              :tone="data.verified ? 'success' : data.domain ? 'warning' : 'neutral'"
              :label="data.verified ? 'Verified' : data.domain ? 'Not verified yet' : 'Not set'"
            />
          </template>
          <p class="text-sm text-muted">
            {{ data.verified
              ? 'Email is sent from this domain.'
              : !data.domain
                ? 'No domain is set, so nothing is sent yet.'
                : data.contactSet
                  ? 'A test message goes to the theatre\'s contact email.'
                  : 'Set the theatre\'s contact email in the organisation settings first: the test message goes there.' }}
          </p>
          <template
            v-if="data.domain && !data.verified"
            #footer
          >
            <UButton
              label="Send a test message"
              variant="outline"
              :loading="busy === 'verify'"
              :disabled="!data.contactSet || busy !== null"
              @click="act('verify')"
            />
          </template>
        </PageSection>

        <PageSection title="Set up automatically">
          <p
            v-if="data.automatic.unavailable === null || data.automatic.unavailable === 'no-token'"
            class="text-sm text-muted"
          >
            Proscenium asks Cloudflare to set up <strong class="text-highlighted">{{ data.automatic.proposed }}</strong> for sending and to add its DNS records, then sends a test message once Cloudflare accepts it. The word before the site's address is the sending label, below.
          </p>
          <UAlert
            v-if="data.automatic.unavailable"
            color="info"
            icon="i-lucide-info"
            :description="UNAVAILABLE[data.automatic.unavailable]"
          />
          <template
            v-if="data.automatic.unavailable === null"
            #footer
          >
            <UButton
              :label="data.domain === data.automatic.proposed ? `Set up ${data.automatic.proposed} again` : `Set up ${data.automatic.proposed}`"
              icon="i-lucide-wand-sparkles"
              :loading="busy === 'set-up'"
              :disabled="busy !== null"
              @click="setUp()"
            />
          </template>
        </PageSection>
      </template>
    </DataBoundary>
    <SettingsSections
      screen="/admin/email"
      heading="Email settings"
      :omit="['core.notifications.verified-domain']"
      :highlight="typeof route.query.setting === 'string' ? route.query.setting : undefined"
      @saved="refresh()"
    >
      <template #after-field="{ setting, value }">
        <UAlert
          v-if="setting.key === 'core.notifications.sending-label' && data?.domain"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :description="`Email keeps coming from ${data.domain}. A new label only takes effect the next time the domain is set up automatically.`"
        />
        <figure
          v-else-if="setting.key === 'core.notifications.email-footer'"
          class="space-y-1"
        >
          <figcaption class="text-sm text-muted">
            How the end of every email looks
          </figcaption>
          <!-- Email is always white, whatever the screen's mode, so the preview is too. -->
          <div class="max-w-md rounded-md border border-default bg-white p-4 text-sm text-stone-900">
            <p
              class="mb-3 border-b-[3px] pb-2 font-semibold"
              :style="{ borderColor: accent }"
            >
              {{ theatreName }}
            </p>
            <p class="mb-3">
              Thank you for booking with us. Your tickets are attached.
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
              No footer is added.
            </p>
          </div>
        </figure>
      </template>
    </SettingsSections>
  </PageFrame>
</template>
