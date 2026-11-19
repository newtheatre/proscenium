<!-- The outside sign-in providers on Admin > Sign-in, set up the way Payments' providers are: one card
     each with its state, and a slide-over that walks through the set-up in order: the redirect URI
     to register with the provider, the client ID, secret and accepted organisations saved together,
     a check with the provider, and putting it in use (or out of use) last, with Undo. -->
<script setup lang="ts">
interface Provider {
  id: string
  label: string
  on: boolean
  clientId: string | null
  domains: string[]
  secret: { saved: boolean, hint: string | null, start: string | null }
  callbackUrl: string
  missing: ('client-id' | 'secret')[]
}

const props = defineProps<{
  /** A provider setting to open the set-up for, from settings search. */
  highlight?: string
}>()

const { t } = useT()
const { $api } = useNuxtApp()
const toast = useToast()
const { confirm } = useConfirm()
const { toRefusal } = useRefusal()
const { data, status, error, refresh } = await useAPI<{ providers: Provider[] }>('/api/core/sign-in-providers', { key: 'core:sign-in-providers' })

const managing = ref<string | null>(null)
const managed = computed(() => data.value?.providers.find(p => p.id === managing.value))
// Settings search lands on a provider's setting by its key, such as core.sign-in.google-domains.
watch([() => props.highlight, data], ([key]) => {
  const id = typeof key === 'string' ? /^core\.sign-in\.([a-z]+)(-|$)/.exec(key)?.[1] : undefined
  if (id && data.value?.providers.some(p => p.id === id)) managing.value = id
}, { immediate: true })

const summaryOf = (p: Provider) => p.domains.length
  ? t('core.sign-in-providers.only-domains', { domains: p.domains.join(', ') })
  : t('core.sign-in-providers.any-account', { provider: p.label })
const badgeOf = (p: Provider): { tone: 'success' | 'danger' | 'neutral', label: string } => {
  if (p.on && p.missing.length) return { tone: 'danger', label: t('core.sign-in-providers.not-ready') }
  if (p.on) return { tone: 'success', label: t('core.sign-in-providers.in-use') }
  if (p.missing.length) return { tone: 'neutral', label: t('core.sign-in-providers.not-set-up') }
  return { tone: 'neutral', label: t('core.sign-in-providers.not-in-use') }
}
const missingLine = (p: Provider) => p.missing.length === 2 ? t('core.sign-in-providers.missing.both') : t(`core.sign-in-providers.missing.${p.missing[0]}`)

// The set-up form, filled from the provider each time its slide-over opens.
const form = reactive({ clientId: '', secret: '', domains: [] as string[] })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const saving = ref(false)
watch(managed, (p, before) => {
  if (!p || p.id === before?.id) return
  Object.assign(form, { clientId: p.clientId ?? '', secret: '', domains: [...p.domains] })
  refusal.value = null
  checked.value = null
}, { immediate: true })

async function save(p: Provider) {
  const domainsChanged = JSON.stringify(form.domains) !== JSON.stringify(p.domains)
  // Narrowing the organisations of a provider in use can shut people out, so it asks first.
  if (domainsChanged && p.on && !(await confirm({
    verb: t('core.sign-in-providers.domains-verb'),
    thing: t('core.sign-in-providers.domains-thing', { provider: p.label }),
    consequence: t('core.sign-in-providers.domains-consequence', { provider: p.label }),
    button: t('core.sign-in-providers.domains-button'),
  }))) return
  saving.value = true
  refusal.value = null
  try {
    await $api(`/api/core/sign-in-providers/${p.id}` as string, {
      method: 'PUT',
      body: { clientId: form.clientId.trim() || null, domains: form.domains, secret: form.secret.trim() || undefined, confirm: true },
    })
    form.secret = ''
    checked.value = null
    toast.add({ title: t('core.sign-in-providers.saved', { provider: p.label }), color: 'success', icon: 'i-lucide-circle-check' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    saving.value = false
  }
}

// The check asks the provider about the saved client ID and secret; nothing is saved.
const checking = ref(false)
const checked = ref<{ passed: true } | { passed: false, refusal: ReturnType<typeof toRefusal> } | null>(null)
async function check(p: Provider) {
  checking.value = true
  checked.value = null
  try {
    await $api(`/api/core/sign-in-providers/${p.id}/check` as string, { method: 'POST', body: {} })
    checked.value = { passed: true }
  }
  catch (e) {
    checked.value = { passed: false, refusal: toRefusal(e) }
  }
  finally {
    checking.value = false
  }
}

// Putting a provider in use is its own setting, saved last, and Undo puts it back.
const switching = ref(false)
async function setOn(p: Provider, on: boolean, undoable = true) {
  switching.value = true
  refusal.value = null
  try {
    await $api(`/api/core/settings/core.sign-in.${p.id}` as string, { method: 'PUT', body: { value: on, confirm: true } })
    await refresh()
    toast.add({
      title: t(on ? 'core.sign-in-providers.now-in-use' : 'core.sign-in-providers.now-out-of-use', { provider: p.label }),
      color: 'success',
      actions: undoable ? [{ label: t('core.undo.button'), icon: 'i-lucide-undo-2', color: 'neutral', variant: 'outline', onClick: () => { void setOn(p, !on, false) } }] : undefined,
    })
  }
  catch (e) {
    const view = toRefusal(e)
    // A rule's refusal names its message by key, as the settings pages show it.
    const field = view.fields?.value
    refusal.value = field?.includes('.') ? { ...view, reason: t(field) } : view
  }
  finally {
    switching.value = false
  }
}

async function copy(text: string) {
  await navigator.clipboard.writeText(text)
  toast.add({ title: t('core.sign-in-providers.copied'), color: 'success', icon: 'i-lucide-clipboard-check' })
}
</script>

<template>
  <div>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: loaded }">
        <ul class="grid gap-4 md:grid-cols-2">
          <li
            v-for="p in loaded.providers"
            :key="p.id"
          >
            <UCard
              class="h-full"
              :ui="{ root: 'flex h-full flex-col', body: 'flex flex-1 flex-col justify-between gap-3' }"
            >
              <div class="flex items-start gap-3">
                <div class="rounded-md bg-elevated p-2">
                  <UIcon
                    name="i-lucide-log-in"
                    class="size-5"
                  />
                </div>
                <div class="min-w-0 flex-1">
                  <h3 class="truncate font-medium text-highlighted">
                    {{ p.label }}
                  </h3>
                  <p class="text-sm text-muted">
                    {{ summaryOf(p) }}
                  </p>
                </div>
              </div>
              <div class="flex min-h-8 items-center gap-2">
                <div class="flex flex-1 flex-wrap items-center gap-2">
                  <StatusBadge v-bind="badgeOf(p)" />
                </div>
                <UButton
                  class="shrink-0"
                  :label="t('core.sign-in-providers.manage')"
                  :aria-label="t('core.sign-in-providers.manage-provider', { provider: p.label })"
                  trailing-icon="i-lucide-chevron-right"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  @click="managing = p.id"
                />
              </div>
            </UCard>
          </li>
        </ul>
      </template>
    </DataBoundary>

    <USlideover
      :open="!!managed"
      :title="managed?.label"
      :description="managed ? t(`core.sign-in-providers.about.${managed.id}`) : undefined"
      @update:open="open => { if (!open) managing = null }"
    >
      <template #body>
        <div
          v-for="p in managed ? [managed] : []"
          :key="p.id"
          class="space-y-8"
        >
          <section class="space-y-2">
            <h3 class="font-medium text-highlighted">
              {{ t('core.sign-in-providers.register.title', { provider: p.label }) }}
            </h3>
            <p class="text-sm text-muted">
              {{ t(`core.sign-in-providers.register.${p.id}`) }}
            </p>
            <UFormField :label="t('core.sign-in-providers.redirect')">
              <div class="flex gap-2">
                <UInput
                  :model-value="p.callbackUrl"
                  readonly
                  class="min-w-0 flex-1"
                  :ui="{ base: 'font-mono text-xs' }"
                />
                <UButton
                  :label="t('core.sign-in-providers.copy')"
                  icon="i-lucide-copy"
                  color="neutral"
                  variant="outline"
                  @click="copy(p.callbackUrl)"
                />
              </div>
            </UFormField>
          </section>

          <!-- Eager: a "needed" message clears as soon as the field is typed in, not on leaving it, so
               the Save button does not jump away from the pointer as it is pressed. -->
          <UForm
            :state="form"
            :validate="() => needs({ clientId: form.clientId, secret: p.secret.saved ? true : form.secret })"
            novalidate
            class="space-y-4"
            @submit="save(p)"
          >
            <h3 class="font-medium text-highlighted">
              {{ t('core.sign-in-providers.client.title') }}
            </h3>
            <RefusalNotice :refusal="refusal" />
            <UFormField
              name="clientId"
              eager-validation
              :label="t('core.sign-in-providers.client-id')"
              :help="t(`core.sign-in-providers.client-id-help.${p.id}`)"
              required
            >
              <UInput
                v-model="form.clientId"
                maxlength="200"
                spellcheck="false"
                autocomplete="off"
              />
            </UFormField>
            <UFormField
              name="secret"
              eager-validation
              :label="t('core.sign-in-providers.secret')"
              :help="t('core.sign-in-providers.secret-help')"
              :hint="p.secret.saved ? t('core.sign-in-providers.secret-saved', { hint: p.secret.hint ?? '' }) : undefined"
              required
            >
              <UInput
                v-model="form.secret"
                type="password"
                autocomplete="new-password"
                spellcheck="false"
                maxlength="2000"
                :placeholder="p.secret.saved ? t('core.sign-in-providers.secret-keep') : undefined"
              />
            </UFormField>
            <UFormField
              name="domains"
              :label="t('core.sign-in-providers.domains')"
              :help="t(`core.sign-in-providers.domains-help.${p.id}`)"
            >
              <UInputTags
                v-model="form.domains"
                :max-length="253"
                :placeholder="t('core.settings-page.add-value')"
                add-on-blur
                add-on-paste
              />
            </UFormField>
            <UButton
              type="submit"
              :label="t('core.sign-in-providers.save')"
              :loading="saving"
            />
          </UForm>

          <section class="space-y-2">
            <h3 class="font-medium text-highlighted">
              {{ t('core.sign-in-providers.check.title') }}
            </h3>
            <p class="text-sm text-muted">
              {{ t('core.sign-in-providers.check.help', { provider: p.label }) }}
            </p>
            <UButton
              :label="t('core.sign-in-providers.check.button', { provider: p.label })"
              icon="i-lucide-shield-check"
              color="neutral"
              variant="outline"
              :loading="checking"
              @click="check(p)"
            />
            <div aria-live="polite">
              <UAlert
                v-if="checked?.passed"
                color="success"
                variant="subtle"
                icon="i-lucide-circle-check"
                :title="t('core.sign-in-providers.check.passed', { provider: p.label })"
              />
              <RefusalNotice
                v-else-if="checked"
                :refusal="checked.refusal"
              />
            </div>
          </section>
        </div>
      </template>
      <template
        v-if="managed"
        #footer
      >
        <div class="flex w-full flex-wrap items-center gap-3">
          <UButton
            :label="managed.on ? t('core.sign-in-providers.take-out-of-use') : t('core.sign-in-providers.put-in-use')"
            :icon="managed.on ? 'i-lucide-circle-pause' : 'i-lucide-circle-play'"
            :color="managed.on ? 'neutral' : 'primary'"
            :variant="managed.on ? 'outline' : 'solid'"
            :loading="switching"
            @click="setOn(managed, !managed.on)"
          />
          <p
            v-if="!managed.on && managed.missing.length"
            class="text-sm text-muted"
          >
            {{ missingLine(managed) }}
          </p>
        </div>
      </template>
    </USlideover>
  </div>
</template>
