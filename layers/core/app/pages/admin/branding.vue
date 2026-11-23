<!-- Branding (C-35, C-36): the theatre's logos, uploaded, checked and described here, and its look
     (colour, greys, heading and body fonts, corners, credit line) with a preview drawn before it is saved. Both
     save through PUT /api/core/branding, which raises the brand's revision so browsers fetch the new
     look. Light and dark, the interface's settings, are drawn beneath as a generated page draws them. -->
<script setup lang="ts">
import { sameValue } from '../../../shared/controls'

interface SettingView {
  key: string
  name: string
  labelKey: string
  helpKey: string
  value: unknown
  default: unknown
  options?: string[]
  canChange: boolean
  changeLabelKey: string
}
type Look = { accent: string, neutral: string, displayFont: string, bodyFont: string, radius: string, creditLine: boolean }

const LOOK: Record<keyof Look, string> = {
  accent: 'core.brand.accent',
  neutral: 'core.brand.neutral',
  displayFont: 'core.brand.display-font',
  bodyFont: 'core.brand.body-font',
  radius: 'core.brand.radius',
  creditLine: 'core.brand.credit-line',
}
const BRAND_KEYS = [...Object.values(LOOK), 'core.brand.logo', 'core.brand.logo-dark', 'core.brand.revision']

const { t } = useT()
const route = useRoute()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { offer } = useUndo()
const highlight = computed(() => typeof route.query.setting === 'string' ? route.query.setting : undefined)
const { data: brand, refresh: refreshBrand } = useBrand()
const { data, status, error, refresh } = await useAPI<{ settings: SettingView[] }>('/api/core/settings', {
  query: { page: 'core.branding' },
  key: 'core:settings:page:core.branding',
})

const setting = (field: keyof Look) => data.value?.settings.find(s => s.key === LOOK[field])
const canChange = computed(() => !!setting('accent')?.canChange)
const ability = computed(() => setting('accent')?.changeLabelKey)
const fields = ['accent', 'neutral', 'displayFont', 'bodyFont', 'radius', 'creditLine'] as const

const saved = (): Look => Object.fromEntries(fields.map(f => [f, setting(f)?.value])) as Look
const defaults = (): Look => Object.fromEntries(fields.map(f => [f, setting(f)?.default])) as Look
const draft = reactive<Look>({ accent: '#2563eb', neutral: 'slate', displayFont: 'system', bodyFont: 'system', radius: 'medium', creditLine: true })
watch(data, () => Object.assign(draft, saved()), { immediate: true })

function choose(field: Exclude<keyof Look, 'accent' | 'creditLine'>, value: string) {
  draft[field] = value
}
function restoreDefaults() {
  Object.assign(draft, defaults())
}
const changes = computed(() => fields.filter(f => !sameValue(draft[f], saved()[f])))
const atDefaults = computed(() => fields.every(f => sameValue(draft[f], defaults()[f])))
const optionsOf = (field: keyof Look) => (setting(field)?.options ?? []).map(o => ({ value: o, label: t(`core.settings.brand.${setting(field)!.name}.options.${o}`) }))

const form = useTemplateRef('form')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const saving = ref(false)
const HEX = /^#[0-9a-f]{6}$/i
const validate = () => HEX.test(draft.accent) ? [] : [{ name: 'accent', message: t('core.branding-page.accent-invalid') }]

async function put(body: Partial<Look>) {
  await $api('/api/core/branding', { method: 'PUT', body })
  await Promise.all([refresh(), refreshBrand()])
}

async function save() {
  if (!changes.value.length || saving.value) return
  const before = saved()
  const body = Object.fromEntries(changes.value.map(f => [f, draft[f]])) as Partial<Look>
  const back = Object.fromEntries(changes.value.map(f => [f, before[f]])) as Partial<Look>
  refusal.value = null
  saving.value = true
  try {
    await put(body)
    offer(t('core.branding-page.saved'), () => put(back))
  }
  catch (e) {
    refusal.value = toRefusal(e)
    form.value?.setErrors(fieldErrors(refusal.value))
  }
  finally {
    saving.value = false
  }
}

// Settings search and site readiness link here with the setting to show.
onMounted(() => {
  if (highlight.value && BRAND_KEYS.includes(highlight.value)) document.getElementById(`setting-${highlight.value}`)?.scrollIntoView({ block: 'center' })
})

const logoHelp = {
  logo: t('core.branding-page.logo-help'),
  logoDark: t('core.branding-page.logo-dark-help'),
}
</script>

<template>
  <PageFrame
    :title="t('core.settings-pages.branding')"
    width="reading"
  >
    <SettingsSearch />
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div class="mt-6 space-y-6">
        <PageSection :title="t('core.branding-page.logo')">
          <p
            v-if="ability && !canChange"
            class="text-sm text-muted"
          >
            {{ t('core.settings-page.read-only', { ability: t(ability) }) }}
          </p>
          <div class="grid gap-6 sm:grid-cols-2">
            <BrandLogoField
              id="setting-core.brand.logo"
              :class="highlight === 'core.brand.logo' ? 'rounded-md bg-primary/10' : ''"
              field="logo"
              :label="t('core.settings.brand.logo.label')"
              :help="logoHelp.logo"
              :current="brand?.logo ?? null"
              :disabled="!canChange"
              @changed="refreshBrand()"
            />
            <BrandLogoField
              id="setting-core.brand.logo-dark"
              :class="highlight === 'core.brand.logo-dark' ? 'rounded-md bg-primary/10' : ''"
              field="logoDark"
              :label="t('core.settings.brand.logo-dark.label')"
              :help="logoHelp.logoDark"
              :current="brand?.logoDark ?? null"
              :disabled="!canChange"
              dark
              @changed="refreshBrand()"
            />
          </div>
        </PageSection>

        <UForm
          ref="form"
          :state="draft"
          :validate="validate"
          novalidate
          @submit="save()"
        >
          <PageSection :title="t('core.settings-sections.brand')">
            <p
              v-if="ability && !canChange"
              class="text-sm text-muted"
            >
              {{ t('core.settings-page.read-only', { ability: t(ability) }) }}
            </p>
            <RefusalNotice :refusal="refusal" />
            <div class="divide-y divide-default">
              <div
                v-for="field in fields"
                :id="`setting-${LOOK[field]}`"
                :key="field"
                class="py-4 first:pt-0 last:pb-0"
                :class="highlight === LOOK[field] ? 'bg-primary/10' : ''"
              >
                <UFormField
                  v-if="setting(field)"
                  :label="t(setting(field)!.labelKey)"
                  :help="t(setting(field)!.helpKey)"
                  :name="field"
                >
                  <FieldColour
                    v-if="field === 'accent'"
                    v-model="draft.accent"
                    :disabled="!canChange"
                  />
                  <USwitch
                    v-else-if="field === 'creditLine'"
                    v-model="draft.creditLine"
                    :disabled="!canChange"
                  />
                  <USelect
                    v-else
                    :model-value="draft[field] as string"
                    :items="optionsOf(field)"
                    value-key="value"
                    :disabled="!canChange"
                    class="w-72"
                    @update:model-value="choose(field, $event)"
                  />
                </UFormField>
              </div>
            </div>
            <FieldGroup
              :title="t('core.branding-page.preview')"
              :description="t('core.branding-page.preview-help')"
            >
              <BrandPreview
                :accent="draft.accent"
                :neutral="draft.neutral"
                :display-font="draft.displayFont"
                :body-font="draft.bodyFont"
                :radius="draft.radius"
                :name="brand?.name || t('core.branding-page.your-theatre')"
                :logo="brand?.logo ?? null"
                :logo-dark="brand?.logoDark ?? null"
              />
            </FieldGroup>
            <template
              v-if="canChange"
              #footer
            >
              <p
                class="text-sm text-muted"
                aria-live="polite"
              >
                {{ changes.length ? t('core.settings-page.changes', { count: changes.length }) : t('core.settings-page.no-changes') }}
              </p>
              <UButton
                v-if="!atDefaults"
                color="neutral"
                variant="outline"
                :label="t('core.branding-page.use-the-defaults')"
                @click="restoreDefaults()"
              />
              <UButton
                type="submit"
                :label="t('core.branding-page.save-look-and-feel')"
                :loading="saving"
                :disabled="!changes.length || saving"
              />
            </template>
          </PageSection>
        </UForm>

        <SettingsSections
          page="core.branding"
          :omit="BRAND_KEYS"
          :highlight="highlight"
        />
      </div>
    </DataBoundary>
  </PageFrame>
</template>
