<script setup lang="ts">
// Email sending (C-32, C-52): the sending domain, whether it is verified, a test message, and,
// where the site has its own domain and a Cloudflare token is set, setting the domain up for you.
definePageMeta({ layout: 'admin' })

interface Sender {
  domain: string | null
  verified: boolean
  contactSet: boolean
  automatic: { proposed: string | null, unavailable: 'no-token' | 'workers-dev' | 'local' | null }
}

const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const { data, status, error, refresh } = useFetch<Sender>('/api/core/notifications/sender')
const busy = ref<'set-up' | 'verify' | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const notice = ref<string | null>(null)

const UNAVAILABLE = {
  'workers-dev': 'This site is on workers.dev, which cannot send email from its own address. Add a custom domain to the Worker and open the site there to set email up automatically.',
  'local': 'This site has no public domain yet, so email cannot be set up automatically here.',
  'no-token': 'To set this up automatically, set the CORE_CLOUDFLARE_TOKEN secret on the Worker with Email Sending edit and Zone read. You can also onboard a domain in the Cloudflare dashboard and enter it in Settings.',
} as const

async function act(kind: 'set-up' | 'verify', body: Record<string, unknown> = {}) {
  refusal.value = null
  notice.value = null
  busy.value = kind
  try {
    const path = kind === 'set-up' ? '/api/core/notifications/set-up-domain' : '/api/core/notifications/verify-domain'
    const answer = await $fetch<{ domain: string }>(path, { method: 'POST', body })
    notice.value = kind === 'set-up'
      ? `Cloudflare is setting up ${answer.domain}. A test message goes to the contact address in a few minutes, once Cloudflare accepts it.`
      : `A test message went to the contact address from ${answer.domain}. Email can now be sent.`
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
      <div
        v-if="data"
        class="space-y-6"
      >
        <UCard>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm text-muted">
                Sending domain
              </p>
              <p class="truncate font-medium text-highlighted">
                {{ data.domain ?? 'Not set' }}
              </p>
            </div>
            <StatusBadge
              :tone="data.verified ? 'success' : data.domain ? 'warning' : 'neutral'"
              :label="data.verified ? 'Verified' : data.domain ? 'Not verified yet' : 'Not set'"
            />
          </div>
          <template
            v-if="data.domain && !data.verified"
            #footer
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <p class="text-sm text-muted">
                {{ data.contactSet ? 'A test message goes to the theatre\'s contact email.' : 'Set the theatre\'s contact email in the organisation settings first: the test message goes there.' }}
              </p>
              <UButton
                label="Send a test message"
                variant="outline"
                :loading="busy === 'verify'"
                :disabled="!data.contactSet || busy !== null"
                @click="act('verify')"
              />
            </div>
          </template>
        </UCard>

        <UCard>
          <h2 class="font-semibold text-highlighted">
            Set up automatically
          </h2>
          <template v-if="data.automatic.unavailable === null || data.automatic.unavailable === 'no-token'">
            <p class="mt-1 text-sm text-muted">
              Proscenium asks Cloudflare to set up <strong class="text-highlighted">{{ data.automatic.proposed }}</strong> for sending and to add its DNS records, then sends a test message once Cloudflare accepts it. The word before the site's address is the sending label in Settings.
            </p>
          </template>
          <UAlert
            v-if="data.automatic.unavailable"
            class="mt-3"
            color="info"
            icon="i-lucide-info"
            :description="UNAVAILABLE[data.automatic.unavailable]"
          />
          <div
            v-if="data.automatic.unavailable === null"
            class="mt-4 flex justify-end"
          >
            <UButton
              :label="data.domain === data.automatic.proposed ? `Set up ${data.automatic.proposed} again` : `Set up ${data.automatic.proposed}`"
              icon="i-lucide-wand-sparkles"
              :loading="busy === 'set-up'"
              :disabled="busy !== null"
              @click="setUp()"
            />
          </div>
        </UCard>

        <UAlert
          v-if="notice"
          color="success"
          icon="i-lucide-circle-check"
          :description="notice"
          role="status"
        />
        <RefusalNotice
          v-if="refusal"
          :refusal="refusal"
        />
      </div>
    </DataBoundary>
  </PageFrame>
</template>
