<!-- A joining or renewal refusal under its field. Where the theatre's help link is set
     (membership.help.link: a page, a web address or an email address), "Contact us" in the sentence
     is a link to it; any other remedy follows the sentence. -->
<script setup lang="ts">
const props = defineProps<{ reason: string, remedy?: string }>()
const { t } = useT()

const PHRASE = 'Contact us' // not-policy: the words the server's sentences use
const href = computed(() => {
  const r = props.remedy?.trim()
  if (!r) return undefined
  if (/^(https?:\/\/|\/)/.test(r)) return r // not-policy: a web address or a page on this site
  if (/^[^@\s]+@[^@\s]+$/.test(r)) return `mailto:${r}` // not-policy: an email address
  return undefined
})
const parts = computed(() => {
  const at = props.reason.indexOf(PHRASE)
  return href.value && at >= 0 ? { before: props.reason.slice(0, at), after: props.reason.slice(at + PHRASE.length) } : null
})
</script>

<template>
  <span v-if="parts">{{ parts.before }}<ULink
    :to="href"
    class="underline"
    :external="!href!.startsWith('/')"
  >{{ t('membership.screens.mine.contact-us') }}</ULink>{{ parts.after }}</span>
  <span v-else>{{ reason }}<template v-if="remedy && !href"> {{ remedy }}</template><template v-else-if="href"> <ULink
    :to="href"
    class="underline"
    :external="!href.startsWith('/')"
  >{{ t('membership.screens.mine.contact-us') }}</ULink></template></span>
</template>
