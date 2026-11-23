<!-- Signing in (ID-14; identity spec part 6): the person's passkeys and recovery codes, then where
     they are signed in (ID-13, its own section since 2026-11-17). Adding or
     removing a passkey, and making new codes, need a fresh re-assertion, which `$api` asks for in
     place. The server keeps the only way in: the last passkey stays unless a confirmed address or a
     linked provider can still sign the person in. New codes are shown once, to be saved. -->
<script setup lang="ts">
import { z } from 'zod'
import type { RefusalView } from '../../utils/refusal'

interface Passkey { id: string, label: string, synced: boolean, addedAt: number, lastUsedAt: number | null }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ passkeys: Passkey[], recoveryCodesLeft: number, authenticator: { addedAt: number } | null, authenticatorOffered: boolean }>('/api/core/me/passkeys', { key: 'core:my-passkeys' })

const { dayLong: day } = useDates()
const refusal = ref<RefusalView | null>(null)
// New codes, shown once until the person says they are saved.
const codes = ref<string[] | null>(null)

async function add() {
  refusal.value = null
  const answer = await addMyPasskey()
  if (!answer.ok) {
    refusal.value = { status: 0, ...answer.refusal }
    return
  }
  toast.add({ title: t('core.me.sign-in.added-toast'), color: 'success' })
  if (answer.data.recoveryCodes?.length) codes.value = answer.data.recoveryCodes
  await refresh()
}

async function remove(passkey: Passkey) {
  if (!await confirm({ verb: t('core.me.sign-in.remove-verb'), thing: passkey.label, consequence: t('core.me.sign-in.remove-consequence') })) return
  refusal.value = null
  try {
    await $api(`/api/core/me/passkeys/${passkey.id}` as '/api/core/me/passkeys/:id', { method: 'DELETE', body: {} })
    toast.add({ title: t('core.me.sign-in.removed'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

async function newCodes() {
  if (!await confirm({ verb: t('core.me.sign-in.new-codes-verb'), thing: t('core.me.sign-in.new-codes-thing'), consequence: t('core.me.sign-in.new-codes-consequence'), button: t('core.me.sign-in.new-codes') })) return
  refusal.value = null
  try {
    const answer = await $api<{ recoveryCodes: string[] }>('/api/core/me/recovery-codes', { method: 'POST', body: {} })
    codes.value = answer.recoveryCodes
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

// Adding an authenticator app: the secret to scan or type, then the first code it shows.
const setup = ref<{ secret: string, uri: string } | null>(null)
const appDigits = ref<number[]>([])
const APP_CODE_LENGTH = 6 // not-policy: an authenticator app shows six digits
const appCode = computed(() => appDigits.value.join(''))
const appSchema = z.object({ code: z.string().regex(/^\d{6}$/, t('core.form.invalid.code', { count: APP_CODE_LENGTH })) }) // not-policy: six digits
const appForm = useTemplateRef('appForm')
// The secret in groups of four, easier to type by hand.
const groupedSecret = computed(() => setup.value?.secret.match(/.{1,4}/g)?.join(' ') ?? '')

async function startApp() {
  refusal.value = null
  try {
    setup.value = await $api<{ secret: string, uri: string }>('/api/core/me/authenticator/start', { method: 'POST', body: {} })
    appDigits.value = []
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

async function confirmApp() {
  refusal.value = null
  try {
    await $api('/api/core/me/authenticator/confirm', { method: 'POST', body: { code: appCode.value } })
    setup.value = null
    toast.add({ title: t('core.me.sign-in.app-added'), color: 'success' })
    await refresh()
  }
  catch (e) {
    appDigits.value = []
    refusal.value = toRefusal(e)
    appForm.value?.setErrors(fieldErrors(refusal.value))
  }
}

async function removeApp() {
  if (!await confirm({ verb: t('core.me.sign-in.remove-verb'), thing: t('core.me.sign-in.app-thing'), consequence: t('core.me.sign-in.app-remove-consequence') })) return
  refusal.value = null
  try {
    await $api('/api/core/me/authenticator', { method: 'DELETE', body: {} })
    toast.add({ title: t('core.me.sign-in.app-removed'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

function kept() {
  codes.value = null
  toast.add({ title: t('core.me.sign-in.codes-kept'), color: 'success' })
}

// The current set shown again, used ones struck through. Asks to confirm it is you in place.
const shown = ref<{ codes: string[], used: boolean[] } | null>(null)

async function showCodes() {
  refusal.value = null
  try {
    const answer = await $api<{ codes: { code: string | null, used: boolean }[] }>('/api/core/me/recovery-codes/show', { method: 'POST', body: {} })
    if (answer.codes.some(c => c.code === null)) {
      toast.add({ title: t('core.me.sign-in.codes-not-kept'), color: 'warning' })
      return
    }
    shown.value = { codes: answer.codes.map(c => c.code!), used: answer.codes.map(c => c.used) }
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <PageFrame
    :title="t('core.me.sign-in.title')"
    :trail="[{ label: t('core.account.title'), to: '/account' }]"
    width="reading"
  >
    <UCard v-if="codes">
      <RecoveryCodes
        :codes="codes"
        @kept="kept()"
      />
    </UCard>
    <UCard v-else-if="shown">
      <RecoveryCodes
        :codes="shown.codes"
        :used="shown.used"
        review
        @kept="shown = null"
      />
    </UCard>
    <div
      v-else
      class="space-y-6"
    >
      <RefusalNotice :refusal="refusal" />
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
          <PageSection
            :title="t('core.me.sign-in.passkeys')"
            :description="t('core.me.sign-in.passkeys-help')"
          >
            <RecordList
              v-if="data.passkeys.length"
              :label="t('core.me.sign-in.passkeys')"
            >
              <RecordListItem
                v-for="p in data.passkeys"
                :key="p.id"
                icon="i-lucide-key-round"
                :name="p.label"
                :description="[
                  p.synced ? t('core.me.sign-in.synced') : t('core.me.sign-in.this-device'),
                  t('core.me.sign-in.added', { date: day(p.addedAt) }),
                  p.lastUsedAt ? t('core.me.sign-in.used', { date: day(p.lastUsedAt) }) : t('core.me.sign-in.never-used'),
                ].join(', ')"
              >
                <UButton
                  size="sm"
                  color="error"
                  variant="ghost"
                  :label="t('core.me.sign-in.remove')"
                  :aria-label="`${t('core.me.sign-in.remove')} ${p.label}`"
                  @click="remove(p)"
                />
              </RecordListItem>
            </RecordList>
            <p
              v-else
              class="text-sm text-muted"
            >
              {{ t('core.me.sign-in.none') }}
            </p>
            <template #footer>
              <UButton
                icon="i-lucide-key-round"
                loading-auto
                :label="t('core.me.sign-in.add')"
                @click="add()"
              />
            </template>
          </PageSection>

          <PageSection
            v-if="data.authenticator || data.authenticatorOffered"
            :title="t('core.me.sign-in.app')"
            :description="t('core.me.sign-in.app-help')"
          >
            <p
              v-if="data.authenticator"
              class="text-sm"
            >
              {{ t('core.me.sign-in.app-on', { date: day(data.authenticator.addedAt) }) }}
            </p>
            <div
              v-else-if="setup"
              class="flex flex-wrap items-start gap-6"
            >
              <div class="w-44 shrink-0">
                <QrCode
                  :value="setup.uri"
                  :label="t('core.me.sign-in.app-qr')"
                />
              </div>
              <UForm
                ref="appForm"
                :schema="appSchema"
                :state="{ code: appCode }"
                class="flex flex-col gap-4"
                novalidate
                @submit="confirmApp"
              >
                <p class="text-sm text-muted">
                  {{ t('core.me.sign-in.app-cant-scan') }} <code class="font-mono text-default">{{ groupedSecret }}</code>
                </p>
                <UFormField
                  :label="t('core.me.sign-in.app-code')"
                  name="code"
                >
                  <UPinInput
                    v-model="appDigits"
                    otp
                    type="number"
                    :length="APP_CODE_LENGTH"
                  />
                </UFormField>
                <div class="flex gap-2">
                  <UButton
                    type="submit"
                    loading-auto
                    :label="t('core.me.sign-in.app-turn-on')"
                  />
                  <UButton
                    color="neutral"
                    variant="ghost"
                    :label="t('core.me.sign-in.app-cancel')"
                    @click="setup = null"
                  />
                </div>
              </UForm>
            </div>
            <template
              v-if="!setup"
              #footer
            >
              <UButton
                v-if="data.authenticator"
                color="error"
                variant="ghost"
                :label="t('core.me.sign-in.remove')"
                @click="removeApp()"
              />
              <UButton
                v-else
                icon="i-lucide-smartphone"
                color="neutral"
                variant="outline"
                loading-auto
                :label="t('core.me.sign-in.app-add')"
                @click="startApp()"
              />
            </template>
          </PageSection>

          <PageSection
            :title="t('core.me.sign-in.codes')"
            :description="t('core.me.sign-in.codes-help')"
          >
            <p class="text-sm">
              {{ data.passkeys.length ? t('core.me.sign-in.codes-left', { count: data.recoveryCodesLeft }) : t('core.me.sign-in.codes-none') }}
            </p>
            <template
              v-if="data.passkeys.length"
              #footer
            >
              <UButton
                v-if="data.recoveryCodesLeft"
                color="neutral"
                variant="outline"
                icon="i-lucide-eye"
                :label="t('core.me.sign-in.show-codes')"
                @click="showCodes()"
              />
              <UButton
                color="neutral"
                variant="outline"
                icon="i-lucide-refresh-cw"
                :label="t('core.me.sign-in.new-codes')"
                @click="newCodes()"
              />
            </template>
          </PageSection>
        </div>
      </DataBoundary>
      <SignedInBrowsers />
    </div>
  </PageFrame>
</template>
