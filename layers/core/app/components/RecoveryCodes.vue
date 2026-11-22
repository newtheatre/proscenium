<!-- Recovery codes (ID-14). Shown after a new set is made, when the person downloads or copies them
     and ticks that they are saved (Matt, 21 November: a tick, not a code typed back); or shown again
     from Signing in (`review`), where used codes are struck through and a Done button closes them. -->
<script setup lang="ts">
import { z } from 'zod'

const props = defineProps<{
  codes: string[]
  /** Which codes have been used, by position. Only when showing an existing set again. */
  used?: boolean[]
  /** Showing an existing set: no tick, a Done button instead. */
  review?: boolean
}>()
const emit = defineEmits<{ kept: [code: string] }>()
// Made by Vue, so two of these on one page (or one in a dialogue over another) never share an id.
const headingId = useId()
// Downloading or copying comes first; the tick then says the person has put them somewhere.
const taken = ref(false)
const state = reactive({ saved: false })
const savedSchema = z.object({ saved: z.boolean() }).superRefine((v, ctx) => {
  if (!taken.value) ctx.addIssue({ code: 'custom', path: ['saved'], message: 'Download or copy the codes first.' })
  else if (!v.saved) ctx.addIssue({ code: 'custom', path: ['saved'], message: 'Tick this once you have saved them.' })
})
const toast = useToast()
const { data: brand } = await useBrand()
const { dayLong } = useDates()

const isUsed = (i: number) => !!props.used?.[i]
const left = computed(() => props.codes.filter((_, i) => !isUsed(i)).length)

/** The set as plain text: what the download holds and what Copy puts on the clipboard. */
function asText(): string {
  const site = brand.value?.name || window.location.host
  const made = dayLong(Date.now())
  return [
    `${site}: recovery codes`,
    `Saved ${made}. Each code works once, if you lose your passkey.`,
    '',
    ...props.codes.map((code, i) => isUsed(i) ? `${code}  (used)` : code),
    '',
  ].join('\n')
}

function download() {
  const site = (brand.value?.name || window.location.host).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const url = URL.createObjectURL(new Blob([asText()], { type: 'text/plain;charset=utf-8' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: `${site || 'site'}-recovery-codes.txt` })
  link.click()
  URL.revokeObjectURL(url)
  taken.value = true
}

async function copy() {
  try {
    await navigator.clipboard.writeText(asText())
    toast.add({ title: 'Recovery codes copied', color: 'success' })
    taken.value = true
  }
  catch {
    toast.add({ title: 'Your browser did not allow copying. Download the codes instead.', color: 'warning' })
  }
}

// Setup's last step takes one of the codes as proof they were shown, so the first is passed on.
function confirm() {
  emit('kept', props.codes[0] ?? '')
}
</script>

<template>
  <section
    :aria-labelledby="headingId"
    class="flex flex-col gap-4"
  >
    <h2
      :id="headingId"
      class="font-semibold text-highlighted"
    >
      Your recovery codes
    </h2>
    <p
      v-if="review"
      class="text-sm text-muted"
    >
      Each one works once, if you lose your passkey. {{ left === 1 ? '1 code is' : `${left} codes are` }} left; used codes are struck through.
    </p>
    <p
      v-else
      class="text-sm text-muted"
    >
      Keep these somewhere safe, such as your password manager. Each one works once, if you lose your passkey. You can see them again from Signing in, after confirming it is you.
    </p>
    <ul class="grid grid-cols-2 gap-2 font-mono text-sm">
      <li
        v-for="(code, i) in codes"
        :key="code"
        :class="isUsed(i) ? 'text-dimmed line-through' : undefined"
      >
        {{ code }}<span
          v-if="isUsed(i)"
          class="sr-only"
        > (used)</span>
      </li>
    </ul>
    <div class="flex flex-wrap gap-2">
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-download"
        label="Download as a text file"
        @click="download()"
      />
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-copy"
        label="Copy"
        @click="copy()"
      />
    </div>
    <UButton
      v-if="review"
      block
      label="Done"
      @click="emit('kept', '')"
    />
    <UForm
      v-else
      :schema="savedSchema"
      :state="state"
      class="flex flex-col gap-4"
      novalidate
      @submit="confirm"
    >
      <UFormField name="saved">
        <UCheckbox
          v-model="state.saved"
          label="I have saved these codes somewhere safe"
        />
      </UFormField>
      <UButton
        type="submit"
        block
      >
        Continue
      </UButton>
    </UForm>
  </section>
</template>
