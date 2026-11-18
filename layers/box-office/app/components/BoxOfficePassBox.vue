<!-- Passes on the Choose tickets page (BO-64; mock-up approved by Matt 2026-11-18). A pass gives one
     entry: its code is typed here, tried at once, and listed as an entry at no charge. Several passes
     may be added, one entry each. A signed-in holder's own passes are offered without typing, and one
     that cannot be used here says why. Closed, it is one quiet line, so nobody without a pass has to
     think about it. -->
<script setup lang="ts">
export interface ChosenPass { code: string, name: string, priceName: string, owedMinor: number, wheelchair: boolean, own: boolean }
interface Offered { code: string, name: string, priceName: string, owedMinor: number, left: number | null, unusable: string | null }

const props = defineProps<{ performanceId: string, mine: Offered[], /** Whether the visitor may book a wheelchair space here. */ wheelchair: boolean, /** A refusal of the hold that is about a pass. */ refusal?: { reason: string, remedy?: string } | null }>()
const passes = defineModel<ChosenPass[]>({ default: () => [] })

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { money } = await useMoney()

const typed = ref('')
const busy = ref(false)
const tried = ref<ReturnType<typeof toRefusal> | null>(null)
const open = ref(passes.value.length > 0 || props.mine.length > 0)
const has = (code: string) => passes.value.some(p => p.code === code)
const unused = computed(() => props.mine.filter(m => !has(m.code)))
const said = computed(() => tried.value ?? props.refusal ?? null)

function add(pass: Offered, own: boolean) {
  if (!has(pass.code)) passes.value = [...passes.value, { code: pass.code, name: pass.name, priceName: pass.priceName, owedMinor: pass.owedMinor, wheelchair: false, own }]
}
async function tryCode() {
  tried.value = null
  busy.value = true
  try {
    const found = await $api<Offered>(`/api/box-office/book/performances/${encodeURIComponent(props.performanceId)}/pass`, { query: { code: typed.value.trim() } })
    if (has(found.code)) tried.value = { code: 'box-office.pass.repeated', reason: t('box-office.book.pass.repeated'), status: 422 } as ReturnType<typeof toRefusal>
    else {
      add(found, false)
      typed.value = ''
    }
  }
  catch (e) {
    tried.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}
const remove = (code: string) => {
  passes.value = passes.value.filter(p => p.code !== code)
}
const setWheelchair = (code: string, on: boolean) => {
  passes.value = passes.value.map(p => (p.code === code ? { ...p, wheelchair: on } : p))
}
</script>

<template>
  <UButton
    v-if="!open"
    color="neutral"
    variant="link"
    icon="i-lucide-id-card"
    :label="t('box-office.book.pass.have-one')"
    class="px-0"
    @click="open = true"
  />
  <UCard
    v-else
    :ui="{ body: 'space-y-4' }"
  >
    <h2 class="flex items-center gap-2 font-medium">
      <UIcon
        name="i-lucide-id-card"
        class="shrink-0"
      />
      {{ t('box-office.book.pass.title') }}
    </h2>
    <ul
      v-if="passes.length"
      class="space-y-2"
    >
      <li
        v-for="pass in passes"
        :key="pass.code"
        class="space-y-2 rounded-md bg-elevated/50 p-3"
      >
        <div class="flex flex-wrap items-start gap-x-3 gap-y-1">
          <UIcon
            name="i-lucide-circle-check"
            class="mt-1 shrink-0 text-success"
          />
          <div class="min-w-0 flex-1">
            <p class="font-medium">
              {{ t('box-office.book.pass.entry', { name: pass.name }) }}
            </p>
            <p class="text-sm text-muted">
              {{ pass.own ? t('box-office.book.pass.yours', { price: pass.priceName }) : pass.code }}
              <template v-if="pass.owedMinor">
                · {{ t('box-office.book.pass.owed', { amount: money(pass.owedMinor) }) }}
              </template>
            </p>
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            :label="t('box-office.book.pass.remove')"
            :aria-label="t('box-office.book.pass.remove-named', { code: pass.code })"
            @click="remove(pass.code)"
          />
        </div>
        <UCheckbox
          v-if="wheelchair"
          :model-value="pass.wheelchair"
          :label="t('box-office.book.pass.wheelchair')"
          :description="t('box-office.book.pass.wheelchair-help')"
          class="ms-7"
          @update:model-value="setWheelchair(pass.code, $event === true)"
        />
      </li>
    </ul>
    <ul
      v-if="unused.length"
      class="space-y-2"
    >
      <li
        v-for="pass in unused"
        :key="pass.code"
        class="flex flex-wrap items-center gap-x-3 gap-y-1"
      >
        <div class="min-w-0 flex-1">
          <p :class="pass.unusable ? 'text-muted' : ''">
            {{ t('box-office.book.pass.your-pass', { name: pass.name, price: pass.priceName }) }}
          </p>
          <p
            v-if="pass.unusable"
            class="text-sm text-muted"
          >
            {{ pass.unusable }}
          </p>
        </div>
        <UButton
          v-if="!pass.unusable"
          color="neutral"
          variant="outline"
          size="sm"
          :label="t('box-office.book.pass.use')"
          @click="add(pass, true)"
        />
      </li>
    </ul>
    <UFormField
      :label="t(passes.length || mine.length ? 'box-office.book.pass.another' : 'box-office.book.pass.add')"
      :help="t('box-office.book.pass.help')"
      :error="said ? [said.reason, said.remedy].filter(Boolean).join(' ') : undefined"
      name="pass"
    >
      <div class="flex gap-2">
        <UInput
          v-model="typed"
          placeholder="PASS-0000-0000"
          maxlength="40"
          autocomplete="off"
          autocapitalize="characters"
          class="w-48 uppercase"
          @keydown.enter.prevent="typed.trim() && tryCode()"
        />
        <UButton
          color="neutral"
          variant="outline"
          :label="t('box-office.book.pass.apply')"
          :loading="busy"
          :disabled="!typed.trim()"
          @click="tryCode"
        />
      </div>
    </UFormField>
  </UCard>
</template>
